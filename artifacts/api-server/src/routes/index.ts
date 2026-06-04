import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import conversationsRouter from "./conversations";
import messagesRouter from "./messages";
import uploadRouter from "./upload";
import syncRouter from "./sync";
import notificationsRouter from "./notifications";
import storageRouter from "./storage";
import aiChatRouter from "./ai-chat";
import docsRouter from "./docs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(conversationsRouter);
router.use(messagesRouter);
router.use(uploadRouter);
router.use(syncRouter);
router.use(notificationsRouter);
router.use(storageRouter);
router.use(aiChatRouter);
router.use(docsRouter);

export default router;
