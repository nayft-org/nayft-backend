import { Router } from 'express';
import { newsBoardController } from './controller';
import { authenticate } from '../../middlewares/auth';

const router = Router();

// All newsboard routes require authentication
router.get('/', authenticate, newsBoardController.getBoards);
router.post('/', authenticate, newsBoardController.createBoard);
router.get('/:boardId/news', authenticate, newsBoardController.getBoardNews);
router.post('/:boardId/items', authenticate, newsBoardController.saveItem);
router.delete('/:boardId/items/:newsId', authenticate, newsBoardController.unsaveItem);

export default router;
