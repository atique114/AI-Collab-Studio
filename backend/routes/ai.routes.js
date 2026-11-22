import { Router } from 'express';
import * as aiController from '../controllers/ai.controller.js';
import { authUser } from '../middleware/auth.middleware.js';
const router = Router();

router.get('/get-result', authUser, aiController.getResult)


export default router;
