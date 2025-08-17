const express = require('express');
const router = express.Router();
const SurveyController = require('../controllers/survey.controller');
const upload = require('../config/multer.config');
const { i18nMiddleware, languageSwitchMiddleware } = require('../middlewares/i18n.middleware');

// Apply i18n middleware to all routes
router.use(languageSwitchMiddleware);
router.use(i18nMiddleware);

// Add new route for rendering create page
router.get('/create', SurveyController.renderCreateSurvey);

// Enhanced route for getting all quizzes (now includes enhanced data)
router.get('/', SurveyController.getSurveys);

// Existing routes
router.post('/', upload.any(), SurveyController.createSurvey);
router.get('/:id', SurveyController.getSurvey);
router.get('/:id/preview', SurveyController.previewSurvey);
router.get('/:id/edit', SurveyController.renderEditSurvey);
router.put('/:id', upload.any(), SurveyController.updateSurvey);

// Enhanced delete route - using the enhanced method
router.delete('/:id', SurveyController.deleteSurveyEnhanced);

// New route for quiz duplication
router.post('/:id/duplicate', SurveyController.duplicateSurvey);

// New route for analytics
// router.get('/api/analytics', SurveyController.get);

module.exports = router;