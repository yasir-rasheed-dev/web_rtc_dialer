import crypto from "node:crypto";
import fs from "node:fs";
import XLSX from "xlsx";

import { db, audit } from "./db.js";


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