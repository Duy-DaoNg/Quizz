const express = require('express');
const router = express.Router();
const PublicSurveyController = require('../controllers/survey.public.controller');
const { requireAuth, requireAdmin } = require('../controllers/auth.controller');
const { i18nMiddleware, languageSwitchMiddleware } = require('../middlewares/i18n.middleware');

// Apply i18n middleware to all routes
router.use(languageSwitchMiddleware);
router.use(i18nMiddleware);

// ========================================
// PUBLIC ROUTES (No authentication required)
// ========================================

// Join test by direct link
router.get('/join/:testCode', PublicSurveyController.renderJoinPage);

// Test room (both admin and participant)
router.get('/room/:testCode', PublicSurveyController.renderSurveyRoom);

// Test results (public after completion)
// router.get('/results/:testCode', PublicSurveyController.renderTestResults);

// API: Get test results
router.get('/api/results/:testCode', PublicSurveyController.getPublicSurveyResults);

// API: Get live test data
router.get('/api/data/:testCode', PublicSurveyController.getPublicSurveyData);

// ========================================
// AUTHENTICATED ROUTES
// ========================================

// Join test by code page (for authenticated users)
router.get('/join', requireAuth, PublicSurveyController.renderJoinByCode);

// Validate test availability
router.post('/validate', PublicSurveyController.validatePublicSurveyAvailability);

// Validate and join test (legacy support)
router.post('/join', PublicSurveyController.validateAndJoinPublicSurvey);

// ========================================
// NEW: OFFLINE MODE ROUTES
// ========================================

// Submit offline answer
// router.post('/submit-offline-answer', PublicSurveyController.submitOfflineAnswer);

// Complete offline test with answers
router.post('/complete-public-survey', PublicSurveyController.completePublicSurveyWithAnswers);

// ========================================
// ADMIN ROUTES
// ========================================

// Create new test
router.post('/create', requireAuth, requireAdmin, PublicSurveyController.createPublicSurvey);

// Test results list (admin only)
router.get('/admin/results', requireAuth, requireAdmin, PublicSurveyController.renderPublicSurveyResultsList);

module.exports = router;