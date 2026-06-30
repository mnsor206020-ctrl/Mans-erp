import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import organizationsRouter from "./organizations";
import usersRouter from "./users";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/dashboard", dashboardRouter);
router.use("/organizations", organizationsRouter);
router.use("/users", usersRouter);

export default router;
