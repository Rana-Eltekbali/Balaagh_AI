import { Router, type IRouter } from "express";
import healthRouter from "./health";
import reportsRouter from "./reports";
import summaryRouter from "./summary";

const router: IRouter = Router();

router.use(healthRouter);
router.use(summaryRouter);
router.use(reportsRouter);

export default router;
