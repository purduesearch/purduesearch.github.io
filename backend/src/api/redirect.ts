import { Router, type Request, type Response } from "express";
import * as utmService from "../services/utmService.js";

export const redirectRouter = Router();

// GET /r/:code — record click and redirect to target
redirectRouter.get("/:code", async (req: Request, res: Response) => {
  try {
    const targetUrl = await utmService.recordClick(req.params.code as string);
    if (!targetUrl) {
      res.status(404).send("Link not found");
      return;
    }
    res.redirect(302, targetUrl);
  } catch (error) {
    console.error("GET /r/:code error:", error);
    res.status(500).send("Error processing redirect");
  }
});
