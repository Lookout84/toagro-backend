import express from 'express';
import { regionController } from '../controllers/regionController';
import { communityController } from '../controllers/communityController';

const router = express.Router();

// ?countryId=1 для фільтрації по країні
router.get('/', regionController.getRegions); // всі області
router.get('/:id', regionController.getRegionById); // конкретний регіон з країною та громадами
router.get('/:regionId/communities', communityController.getCommunitiesByRegion); // громади області

export default router;