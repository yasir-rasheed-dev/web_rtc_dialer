import crypto from "node:crypto";
import fs from "node:fs";
import XLSX from "xlsx";

import { db, audit } from "./db.js";

// Buckets the raw campaign_contacts.status enum into the 5 groups the
// "Manage" detail view filters/counts by.
const STATUS_BUCKETS = {
  pending: ["NEW", "ASSIGNED", "READY", "CALLING"],
  connected: ["CONNECTED", "COMPLETED"],
  failed: ["FAILED", "DNC"],
  retry: ["NO_ANSWER", "BUSY", "CALLBACK"]
};


// ===============================
// GET CAMPAIGNS
// ===============================

export async function getCampaigns(req, res) {
  const [rows] = await db.execute(
    `
    SELECT 
      c.*,
      COUNT(cc.id) AS total_contacts,
      SUM(cc.status='CONNECTED') AS connected_contacts
    FROM campaigns c
    LEFT JOIN campaign_contacts cc 
      ON cc.campaign_id=c.id
      AND cc.tenant_id=c.tenant_id
    WHERE c.tenant_id=?
    GROUP BY c.id
    ORDER BY c.created_at DESC
    `,
    [req.user.tenant_id]
  );


  res.json({
    campaigns: rows
  });
}





// ===============================
// CREATE CAMPAIGN
// ===============================

export async function createCampaign(req,res){

const id = crypto.randomUUID();


const {
 name,
 description,
 mode,
 startDate,
 endDate,
 timezone,
 maxAttempts,
 retryDelayMinutes
}=req.body;


if(!name){
 return res.status(400).json({
  error:"Campaign name required"
 });
}



await db.execute(
`
INSERT INTO campaigns
(
id,
tenant_id,
name,
description,
mode,
status,
start_date,
end_date,
timezone,
max_attempts,
retry_delay_minutes,
created_by_user_id
)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
`,
[
id,
req.user.tenant_id,
name,
description || null,
mode || "CLICK_TO_CALL",
"DRAFT",
startDate || null,
endDate || null,
timezone || "UTC",
maxAttempts || 3,
retryDelayMinutes || 30,
req.user.id
]
);



await audit(
req.user.id,
"CAMPAIGN_CREATE",
"campaign",
id,
{
name
},
req.user.tenant_id
);



res.status(201).json({
id
});

}







// ===============================
// UPDATE CAMPAIGN
// ===============================


export async function updateCampaign(req,res){

await db.execute(
`
UPDATE campaigns SET

name=?,
description=?,
mode=?,
status=?,
start_date=?,
end_date=?,
timezone=?,
max_attempts=?,
retry_delay_minutes=?

WHERE id=?
AND tenant_id=?
`,
[
req.body.name,
req.body.description || null,
req.body.mode,
req.body.status,
req.body.startDate || null,
req.body.endDate || null,
req.body.timezone || "UTC",
req.body.maxAttempts || 3,
req.body.retryDelayMinutes || 30,
req.params.id,
req.user.tenant_id
]
);


res.status(204).end();

}






// ===============================
// DELETE CAMPAIGN
// ===============================


export async function deleteCampaign(req,res){


await db.execute(
`
DELETE FROM campaigns
WHERE id=?
AND tenant_id=?
`,
[
req.params.id,
req.user.tenant_id
]
);


res.status(204).end();

}







// ===============================
// UPLOAD EXCEL CONTACTS
// ===============================


export async function uploadCampaignContacts(req,res){

if(!req.file){

return res.status(400).json({
error:"Excel file required"
});

}


const workbook =
XLSX.readFile(req.file.path);


const sheet =
workbook.Sheets[
workbook.SheetNames[0]
];


const rows =
XLSX.utils.sheet_to_json(sheet);



let inserted=0;
let skipped=0;



for(const row of rows){


const phone =
String(
row.Phone ||
row.phone ||
""
).trim();



if(!phone){

skipped++;
continue;

}



await db.execute(
`
INSERT INTO campaign_contacts
(
id,
tenant_id,
campaign_id,
name,
phone,
email,
company,
status
)
VALUES (?,?,?,?,?,?,?,?)
`,
[
crypto.randomUUID(),

req.user.tenant_id,

req.params.id,

row.Name || row.name || null,

phone,

row.Email || row.email || null,

row.Company || row.company || null,

"NEW"

]
);


inserted++;

}



fs.unlinkSync(req.file.path);



res.json({

total:rows.length,

inserted,

skipped

});


}







// ===============================
// ASSIGN CONTACTS TO AGENTS
// ===============================


export async function assignCampaignAgents(req,res){


const {
agents,
type
}=req.body;



if(
!Array.isArray(agents)
||
!agents.length
){

return res.status(400).json({
error:"Agents required"
});

}




// save campaign agents


for(const agentId of agents){

await db.execute(
`
INSERT IGNORE INTO campaign_agents
(
id,
tenant_id,
campaign_id,
user_id,
assignment_type
)
VALUES (?,?,?,?,?)
`,
[
crypto.randomUUID(),
req.user.tenant_id,
req.params.id,
agentId,
type || "ROUND_ROBIN"
]
);

}




const [contacts] =
await db.execute(
`
SELECT id
FROM campaign_contacts
WHERE tenant_id=?
AND campaign_id=?
AND status='NEW'
ORDER BY created_at ASC
`,
[
req.user.tenant_id,
req.params.id
]
);



let index=0;


for(const contact of contacts){


const agent =
agents[
index % agents.length
];


await db.execute(
`
UPDATE campaign_contacts

SET
assigned_agent_id=?,
status='ASSIGNED'

WHERE id=?
AND tenant_id=?
`,
[
agent,
contact.id,
req.user.tenant_id
]
);


index++;

}



res.json({

assigned:contacts.length

});


}







// ===============================
// REPORT
// ===============================


export async function getCampaignReport(req,res){



const [[summary]] =
await db.execute(
`
SELECT

COUNT(*) total,

SUM(status='CONNECTED') connected,

SUM(status='NO_ANSWER') no_answer,

SUM(status='BUSY') busy,

SUM(status='COMPLETED') completed


FROM campaign_contacts

WHERE campaign_id=?
AND tenant_id=?

`,
[
req.params.id,
req.user.tenant_id
]
);




const [agents] =
await db.execute(
`
SELECT

u.name,

COUNT(cc.id) total_calls,

SUM(cc.status='CONNECTED') connected


FROM campaign_contacts cc

LEFT JOIN users u
ON u.id=cc.assigned_agent_id


WHERE cc.campaign_id=?
AND cc.tenant_id=?


GROUP BY u.id

`,
[
req.params.id,
req.user.tenant_id
]
);



res.json({

summary,

agents

});


}




// ===============================
// CAMPAIGN DETAIL (for the "Manage" view)
// ===============================

export async function getCampaignDetail(req, res) {
  const tenantId = req.user.tenant_id;
  const campaignId = req.params.id;

  const [[campaign]] = await db.execute(
    `
    SELECT
      c.*,
      COUNT(cc.id) AS total_contacts,
      SUM(cc.status='CONNECTED' OR cc.status='COMPLETED') AS connected_contacts
    FROM campaigns c
    LEFT JOIN campaign_contacts cc
      ON cc.campaign_id=c.id
      AND cc.tenant_id=c.tenant_id
    WHERE c.id=? AND c.tenant_id=?
    GROUP BY c.id
    `,
    [campaignId, tenantId]
  );

  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  const [agents] = await db.execute(
    `
    SELECT ca.user_id, ca.assignment_type, u.name
    FROM campaign_agents ca
    JOIN users u ON u.id=ca.user_id AND u.tenant_id=ca.tenant_id
    WHERE ca.tenant_id=? AND ca.campaign_id=? AND ca.active=1
    ORDER BY u.name ASC
    `,
    [tenantId, campaignId]
  );

  res.json({ campaign, agents });
}

// ===============================
// CAMPAIGN CONTACT QUEUE (for the "Manage" view)
// ===============================

export async function getCampaignContacts(req, res) {
  const tenantId = req.user.tenant_id;
  const campaignId = req.params.id;
  const status = String(req.query.status || "all").toLowerCase();
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));

  const statusList = STATUS_BUCKETS[status] || null;

  const params = [tenantId, campaignId];
  let where = "WHERE cc.tenant_id=? AND cc.campaign_id=?";
  if (statusList) {
    where += ` AND cc.status IN (${statusList.map(() => "?").join(",")})`;
    params.push(...statusList);
  }

  const [[{ total }]] = await db.execute(
    `SELECT COUNT(*) total FROM campaign_contacts cc ${where}`,
    params
  );

  const [rows] = await db.execute(
    `
    SELECT cc.id, cc.name, cc.phone, cc.email, cc.company, cc.status,
           cc.attempt_count, cc.disposition, cc.next_attempt_at, cc.last_called_at,
           u.name AS agent_name
    FROM campaign_contacts cc
    LEFT JOIN users u ON u.id=cc.assigned_agent_id AND u.tenant_id=cc.tenant_id
    ${where}
    ORDER BY cc.created_at ASC
    LIMIT ? OFFSET ?
    `,
    [...params, pageSize, (page - 1) * pageSize]
  );

  const [countRows] = await db.execute(
    `SELECT status, COUNT(*) count FROM campaign_contacts WHERE tenant_id=? AND campaign_id=? GROUP BY status`,
    [tenantId, campaignId]
  );
  const countsByStatus = Object.fromEntries(countRows.map((row) => [row.status, Number(row.count)]));
  const bucketCount = (keys) => keys.reduce((sum, key) => sum + (countsByStatus[key] || 0), 0);

  res.json({
    contacts: rows,
    total,
    page,
    pageSize,
    counts: {
      total: countRows.reduce((sum, row) => sum + Number(row.count), 0),
      pending: bucketCount(STATUS_BUCKETS.pending),
      connected: bucketCount(STATUS_BUCKETS.connected),
      failed: bucketCount(STATUS_BUCKETS.failed),
      retry: bucketCount(STATUS_BUCKETS.retry)
    }
  });
}