import { Router, type IRouter } from "express";
import { NotificationService } from "../services/notificationService.js";
import { authenticate, type AuthRequest } from "../middlewares/authenticate.js";

const router: IRouter = Router();

/**
 * GET /api/notifications
 * Get all notifications for current user
 */
router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const notifs = await NotificationService.getUserNotifications(req.user!.userId);
    res.json({ notifications: notifs });
  } catch (error) {
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read
 */
router.patch("/:id/read", authenticate, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const [notif] = await NotificationService.markAsRead(id, req.user!.userId);
    if (!notif) {
      res.status(404).json({ error: "Notification introuvable" });
      return;
    }
    res.json({ notification: notif });
  } catch (error) {
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/**
 * POST /api/notifications/read-all
 * Mark all user notifications as read
 */
router.post("/read-all", authenticate, async (req: AuthRequest, res) => {
  try {
    await NotificationService.markAllRead(req.user!.userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
