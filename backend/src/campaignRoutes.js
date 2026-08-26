import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import multer from "multer";

import {
    getCampaigns,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    uploadCampaignContacts,
    assignCampaignAgents,
    getCampaignReport,
    getCampaignDetail,
    getCampaignContacts
} from "./campaign.js";

import {
    getNextDialerContact,
    dialCampaignContact,
    updateDialerDisposition
} from "./dialer.js";

import { requirePermission } from "./saas.js";

const uploadDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "uploads/campaigns");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir });

function asyncRoute(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

// `authenticate` lives in server.js, which imports this module. Taking it as an
// argument keeps the dependency one-way and avoids the import cycle.
export default function createCampaignRoutes(authenticate) {
    const router = express.Router();

    // Agent dialer — registered first so the literal /dialer segment is never
    // shadowed by the /:id routes below.

    router.get(
        "/dialer/next/:campaignId",
        authenticate,
        requirePermission("USE_AUTO_DIALER"),
        asyncRoute(getNextDialerContact)
    );

    router.post(
        "/dialer/call",
        authenticate,
        requirePermission("USE_AUTO_DIALER"),
        asyncRoute(dialCampaignContact)
    );

    router.patch(
        "/dialer/disposition",
        authenticate,
        requirePermission("USE_AUTO_DIALER"),
        asyncRoute(updateDialerDisposition)
    );

    // Campaign management

    router.get(
        "/",
        authenticate,
        requirePermission("VIEW_CAMPAIGNS", "MANAGE_CAMPAIGNS", "USE_AUTO_DIALER"),
        asyncRoute(getCampaigns)
    );

    router.post(
        "/",
        authenticate,
        requirePermission("CREATE_CAMPAIGNS", "MANAGE_CAMPAIGNS"),
        asyncRoute(createCampaign)
    );

    router.patch(
        "/:id",
        authenticate,
        requirePermission("MANAGE_CAMPAIGNS"),
        asyncRoute(updateCampaign)
    );

    router.delete(
        "/:id",
        authenticate,
        requirePermission("MANAGE_CAMPAIGNS"),
        asyncRoute(deleteCampaign)
    );

    router.post(
        "/:id/upload",
        authenticate,
        requirePermission("UPLOAD_CONTACTS"),
        upload.single("file"),
        asyncRoute(uploadCampaignContacts)
    );

    router.post(
        "/:id/assign",
        authenticate,
        requirePermission("ASSIGN_CONTACTS"),
        asyncRoute(assignCampaignAgents)
    );

    router.get(
        "/:id/report",
        authenticate,
        requirePermission("VIEW_CAMPAIGN_REPORTS"),
        asyncRoute(getCampaignReport)
    );

    router.get(
        "/:id/contacts",
        authenticate,
        requirePermission("VIEW_CAMPAIGNS", "MANAGE_CAMPAIGNS"),
        asyncRoute(getCampaignContacts)
    );

    router.get(
        "/:id",
        authenticate,
        requirePermission("VIEW_CAMPAIGNS", "MANAGE_CAMPAIGNS"),
        asyncRoute(getCampaignDetail)
    );

    return router;
}
