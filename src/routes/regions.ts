import express from 'express';
import { regionController } from '../controllers/regionController';
import { communityController } from '../controllers/communityController';

const router = express.Router();

router.get('/', regionController.getRegions); // всі області
router.get('/:regionId/communities', communityController.getCommunitiesByRegion); // громади області

export default router;