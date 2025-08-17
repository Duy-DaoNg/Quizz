const SurveyService = require('../services/survey.service');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Helper function to determine quiz status
// function getSurveyStatus(survey) {
//     const now = new Date();
//     const startTime = new Date(survey.scheduleSettings.startTime);
//     const endTime = new Date(survey.scheduleSettings.endTime);
    
//     if (now < startTime) {
//         return 'scheduled';
//     } else if (now >= startTime && now <= endTime) {
//         return 'active';
//     } else {
//         return 'expired';
//     }
// }

// Thay thế estimateQuizDuration bằng formatDuration
function formatDuration(totalSeconds) {
    if (totalSeconds < 60) {
        return `${totalSeconds}s`;
    } else if (totalSeconds < 3600) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
    } else {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
}

// Helper function to get room name
function getRoomName(roomCode) {
    const roomNames = {
        'hrm': 'Human Resource Management',
        'hse': 'Health, Safety & Environment',
        'gm': 'General Management',
        'qaqs': 'Quality Assurance & Quality System',
        'sm': 'Sales Marketing',
        'fol': 'SX-FOL',
        'eol': 'SX-EOL',
        'it': 'Công nghệ thông tin',
        'mkt': 'Marketing',
        'eng': 'Kỹ Thuật',
        'wh': 'Kho',
        'log': 'Logistic',
        'pnp': 'Thu mua - Kế hoạch',
        'acc': 'Kế toán'
    };
    return roomNames[roomCode] || roomCode.toUpperCase();
}

class SurveyController {
    async createSurvey(req, res) {
        try {
            // Get roomCode from admin's selected room session
            const roomCode = req.session?.selectedRoom?.code;
            if (!roomCode) {
                return res.status(400).json({ 
                    error: req.t('auth:room_selection_required')
                });
            }

            // Add roomCode to quiz data
            const quizData = { ...req.body };
            const quizInfo = JSON.parse(quizData.quizInfo);
            quizInfo.roomCode = roomCode;
            quizData.quizInfo = JSON.stringify(quizInfo);

            // Use QuizService with translation function
            const survey = await SurveyService.createSurvey(quizData, req.files, req.t);
            
            console.log(`✅ Survey "${survey.title}" (Number: ${survey.number}) created for ${roomCode.toUpperCase()} department by ${req.session.user.email}`);
            
            res.status(201).json(survey);
        } catch (error) {
            console.error('Create survey error:', error);
            res.status(500).json({ 
                error: error.message || req.t('survey:create_survey_error')
            });
        }
    }

    async getSurvey(req, res) {
        try {
            // Use QuizService with translation function
            let survey = await SurveyService.getSurvey(req.params.id, req.t);
            
            // Check room access permissions
            const userRoomCode = req.session?.selectedRoom?.code;
            if (userRoomCode && survey.roomCode && survey.roomCode !== userRoomCode) {
                return res.status(403).json({ 
                    error: req.t('survey:access_denied_different_department')
                });
            }
            res.json(survey);
        } catch (error) {
            res.status(404).json({ 
                error: error.message || req.t('survey:survey_not_found')
            });
        }
    }

    async updateSurvey(req, res) {
        try {
            // Check room edit permissions
            const survey = await SurveyService.getSurvey(req.params.id, req.t);
            const userRoomCode = req.session?.selectedRoom?.code;
            
            if (userRoomCode && survey.roomCode && survey.roomCode !== userRoomCode) {
                return res.status(403).json({ 
                    error: req.t('survey:access_denied_edit_department')
                });
            }

            // Use QuizService with translation function
            const updatedSurvey = await SurveyService.updateSurvey(req.params.id, req.body, req.files, req.t);
            
            console.log(`✅ Survey "${updatedSurvey.title}" (Number: ${updatedSurvey.number}) updated in ${survey.roomCode?.toUpperCase()} department by ${req.session.user.email}`);
            
            res.json(updatedSurvey);
        } catch (error) {
            console.error('Error updating survey:', error);
            res.status(400).json({ 
                error: error.message || req.t('survey:update_survey_error')
            });
        }
    }

    async deleteSurvey(req, res) {
        try {
            // Check room delete permissions
            const survey = await SurveyService.getSurvey(req.params.id, req.t);
            const userRoomCode = req.session?.selectedRoom?.code;
            
            if (userRoomCode && survey.roomCode && survey.roomCode !== userRoomCode) {
                return res.status(403).json({ 
                    error: req.t('survey:access_denied_edit_department')
                });
            }

            // Use QuizService with translation function
            const result = await SurveyService.deleteSurvey(req.params.id, req.t);
            
            console.log(`🗑️ Survey "${survey.title}" (Number: ${survey.number}) deleted from ${survey.roomCode?.toUpperCase()} department by ${req.session.user.email}`);
            
            res.json(result);
        } catch (error) {
            res.status(400).json({ 
                error: error.message || req.t('survey:delete_survey_error')
            });
        }
    }

    // Unified render method for both create and edit with i18n
    renderCreateSurvey(req, res) {
        const roomInfo = req.session?.selectedRoom;
        if (!roomInfo) {
            return res.redirect('/auth/admin/select-room');
        }

        res.render('survey/form', {
            title: req.t('survey:create_new_survey') + ' - ' + getRoomName(roomInfo.code),
            isEdit: false,
            quiz: null,
            user: req.session.user,
            roomInfo: roomInfo,
            lng: req.language || 'vi',
            // Pass all i18n helpers
            t: req.t,
            ti: res.locals.ti,
            formatDate: res.locals.formatDate,
            formatNumber: res.locals.formatNumber,
            layout: false
        });
    }

    async renderEditSurvey(req, res) {
        try {
            // Use SurveyService with translation function
            let survey = await SurveyService.getSurvey(req.params.id, req.t);
            
            // Check room access permissions
            const userRoomCode = req.session?.selectedRoom?.code;
            if (userRoomCode && survey.roomCode && survey.roomCode !== userRoomCode) {
                return res.status(403).render('error/403', {
                    title: req.t('error:access_denied'),
                    message: req.t('survey:access_denied_edit_department'),
                    lng: req.language || 'vi',
                    t: req.t,
                    layout: false
                });
            }
            
            const roomInfo = req.session?.selectedRoom;
            
            res.render('survey/form', {
                title: req.t('survey:edit_survey') + ` #${survey.number} - ` + getRoomName(roomInfo?.code || survey.roomCode),
                isEdit: true,
                quiz: {
                    ...survey.toObject(),
                    testDuration: survey.testDuration || null
                },
                user: req.session.user,
                roomInfo: roomInfo,
                lng: req.language || 'vi',
                // Pass all i18n helpers
                t: req.t,
                ti: res.locals.ti,
                formatDate: res.locals.formatDate,
                formatNumber: res.locals.formatNumber,
                layout: false
            });
        } catch (error) {
            console.error('Error loading survey for edit:', error);
            res.status(404).render('error/404', {
                title: req.t('error:survey_not_found'),
                message: req.t('error:survey_not_found_desc'),
                lng: req.language || 'vi',
                t: req.t,
                layout: false
            });
        }
    }

    // Enhanced getSurveys method with room filtering and i18n support
    async getSurveys(req, res) {
        try {
            const user = req.session.user;
            const roomInfo = req.session?.selectedRoom;
            
            // Get pagination parameters
            const page = parseInt(req.query.page) || 1;
            const limit = 12; // Default 12 surveys per page
            const skip = (page - 1) * limit;
            
            // Get roomCode for filtering
            const roomCode = roomInfo?.code;
            if (!roomCode) {
                return res.redirect('/auth/admin/select-room');
            }
            
            // Fetch all surveyzes filtered by room code using ServeyService with translation
            const allSurveys = await SurveyService.getAllSurveys(req.t);
            const filteredSurveys = allSurveys.filter(survey => survey.roomCode === roomCode);
            
            // Apply pagination
            const totalSurveys = filteredSurveys.length;
            const totalPages = Math.ceil(totalSurveys / limit);
            const paginatedSurveys = filteredSurveys.slice(skip, skip + limit);
            
            // Add additional stats and formatting with survey number support
            const enhancedSurveys = paginatedSurveys.map(survey => {
                const migratedSurvey = survey;
                const totalSeconds = migratedSurvey.questions ?
                    migratedSurvey.questions.reduce((sum, q) => sum + (q.answerTime || 30), 0) : 0;
                // Calculate completion percentage
                const completionRate = survey.totalCount > 0 ? 
                    Math.round((survey.completedCount / survey.totalCount) * 100) : 0;
                
                // Format dates
                const updatedDate = new Date(survey.updatedAt);
                const now = new Date();
                
                // Calculate relative time with i18n
                const daysDiff = Math.floor((now - updatedDate) / (1000 * 60 * 60 * 24));
                let relativeTime;
                if (daysDiff === 0) {
                    relativeTime = req.t('survey:today');
                } else if (daysDiff === 1) {
                    relativeTime = req.t('survey:yesterday');
                } else if (daysDiff < 7) {
                    relativeTime = req.t('survey:days_ago', { count: daysDiff });
                } else {
                    relativeTime = res.locals.formatDate(updatedDate);
                }
                
                return {
                    ...migratedSurvey.toObject ? migratedSurvey.toObject() : migratedSurvey,
                    // Include quiz number
                    number: survey.number,
                    completionRate,
                    relativeTime,
                    isRecent: daysDiff <= 7,
                    hasParticipants: (survey.totalCount || 0) > 0,
                    averageScore: survey.averageScore || 0,
                    // status: getSurveyStatus(survey),
                    estimatedDuration: formatDuration(survey.testDuration * 60),
                    totalDuration: totalSeconds,
                    // Enhanced metadata
                    totalDuration: migratedSurvey.questions ? 
                        migratedSurvey.questions.reduce((sum, q) => sum + (q.answerTime || 30), 0) : 0,
                    hasImages: migratedSurvey.questions ? 
                        migratedSurvey.questions.some(q => q.image) : false,
                    optionCounts: migratedSurvey.questions ? 
                        migratedSurvey.questions.map(q => q.options ? q.options.length : 2) : []
                };
            });
            
            // Calculate summary statistics for current room
            const stats = {
                total: totalSurveys,
                online: filteredSurveys.filter(q => q.mode === 'online').length,
                offline: filteredSurveys.filter(q => q.mode === 'offline').length,
                active: filteredSurveys.filter(q => q.status === 'active').length,
                totalParticipants: filteredSurveys.reduce((sum, q) => sum + (q.totalCount || 0), 0),
                averageQuestions: filteredSurveys.length > 0 ? 
                    Math.round(filteredSurveys.reduce((sum, q) => sum + q.questions.length, 0) / filteredSurveys.length) : 0,
                totalDuration: filteredSurveys.reduce((sum, q) => {
                    const duration = q.questions ? q.questions.reduce((qSum, question) => qSum + (question.answerTime || 30), 0) : 0;
                    return sum + duration;
                }, 0),
                // Quiz number stats
                numberRange: filteredSurveys.length > 0 ? {
                    lowest: Math.min(...filteredSurveys.map(q => q.number || 999999)),
                    highest: Math.max(...filteredSurveys.map(q => q.number || 0))
                } : null
            };
            
            res.render('survey/list', {
                title: req.t('survey:survey_management') + ' - ' + getRoomName(roomCode),
                user: user,
                quizzes: enhancedSurveys,
                stats: stats,
                roomInfo: roomInfo,
                lng: req.language || 'vi',
                // Pass all i18n helpers
                t: req.t,
                ti: res.locals.ti,
                formatDate: res.locals.formatDate,
                formatNumber: res.locals.formatNumber,
                // Pagination data
                currentPage: page,
                totalPages: totalPages,
                totalQuizzes: totalSurveys,
                pagination: {
                    hasNext: page < totalPages,
                    hasPrev: page > 1,
                    nextPage: page + 1,
                    prevPage: page - 1,
                    pages: Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        const startPage = Math.max(1, page - 2);
                        return startPage + i;
                    }).filter(p => p <= totalPages)
                },
                activePage: 'surveys',
                layout: false
            });
            
        } catch (error) {
            console.error('Error fetching surveys:', error);
            res.status(500).render('error/500', {
                title: req.t('error:server_error'),
                message: req.t('error:unable_load_surveys'),
                lng: req.language || 'vi',
                t: req.t,
                layout: false
            });
        }
    }

    async previewSurvey(req, res) {
        try {
            // Use QuizService with translation function
            let survey = await SurveyService.getSurvey(req.params.id, req.t);
            
            // Check room access permissions
            const userRoomCode = req.session?.selectedRoom?.code;
            if (userRoomCode && survey.roomCode && survey.roomCode !== userRoomCode) {
                return res.status(403).render('error/403', {
                    title: req.t('error:access_denied'),
                    message: req.t('survey:access_denied_preview_department'),
                    lng: req.language || 'vi',
                    t: req.t,
                    layout: false
                });
            }

            res.render('survey/preview', {
                title: req.t('survey:preview_survey') + ` #${survey.number} - ` + getRoomName(survey.roomCode),
                quiz: survey,
                isPreview: true,
                user: req.session.user,
                roomInfo: req.session?.selectedRoom,
                lng: req.language || 'vi',
                // Pass all i18n helpers
                t: req.t,
                ti: res.locals.ti,
                formatDate: res.locals.formatDate,
                formatNumber: res.locals.formatNumber,
                layout: false
            });
        } catch (error) {
            console.error('Error loading survey preview:', error);
            res.status(404).render('error/404', {
                title: req.t('error:survey_not_found'),
                message: req.t('error:survey_not_found_desc'),
                lng: req.language || 'vi',
                t: req.t,
                layout: false
            });
        }
    }

    // Enhanced duplication with room code preservation and i18n
    async duplicateSurvey(req, res) {
        try {
            const originalQuizId = req.params.id;
            
            // Get the original quiz using SurveyService with translation
            let originalSurvey = await SurveyService.getSurvey(originalQuizId, req.t);
            if (!originalSurvey) {
                return res.status(404).json({
                    success: false,
                    message: req.t('survey:original_survey_not_found')
                });
            }

            // Check room duplicate permissions
            const userRoomCode = req.session?.selectedRoom?.code;
            if (userRoomCode && originalSurvey.roomCode && originalSurvey.roomCode !== userRoomCode) {
                return res.status(403).json({
                    success: false,
                    message: req.t('survey:access_denied_duplicate_department')
                });
            }
            
            // duplicate image
            originalSurvey = cloneImage(originalSurvey);
            
            // Create new quiz data in new format with same room code
            const copyLabel = req.t('survey:copy');
            const duplicateData = {
                quizInfo: JSON.stringify({
                    title: `${originalSurvey.title} (${copyLabel})`,
                    roomCode: originalSurvey.roomCode,
                    scheduleSettings: originalSurvey.scheduleSettings,
                    testDuration: originalSurvey.testDuration || null,
                }),
                questionsData: JSON.stringify(originalSurvey.questions.map((q, index) => ({
                    number: index + 1,
                    content: q.content,
                    answer: "",
                    imagePath: q.image || null,
                })))
            };
            
            // Create the duplicate using SurveyService with translation
            const duplicatedSurvey = await SurveyService.createSurvey(duplicateData, null, req.t);
            
            // Log the action
            console.log(`📋 Survey "${originalSurvey.title}" (Number: ${originalSurvey.number}) duplicated as Quiz #${duplicatedSurvey.number} in ${originalSurvey.roomCode?.toUpperCase()} department by user ${req.session.user.email}`);
            
            res.json({
                success: true,
                message: req.t('survey:survey_duplicated_as_number', { number: duplicatedSurvey.number }),
                quiz: {
                    id: duplicatedSurvey._id,
                    number: duplicatedSurvey.number,
                    title: duplicatedSurvey.title,
                    roomCode: duplicatedSurvey.roomCode
                }
            });
            
        } catch (error) {
            console.error('Duplicate survey error:', error);
            res.status(500).json({
                success: false,
                message: req.t('survey:failed_duplicate_survey'),
                error: process.env.NODE_ENV === 'development' ? error.message : req.t('error:server_error')
            });
        }
    }

    // Enhanced delete method with room access check and i18n
    async deleteSurveyEnhanced(req, res) {
        try {
            const quizId = req.params.id;
            
            // Verify survey exists and user has permission using SurveyService with translation
            const survey = await SurveyService.getSurvey(quizId, req.t);
            if (!survey) {
                return res.status(404).json({
                    success: false,
                    message: req.t('survey:survey_not_found')
                });
            }

            // Check room delete permissions
            const userRoomCode = req.session?.selectedRoom?.code;
            if (userRoomCode && survey.roomCode && survey.roomCode !== userRoomCode) {
                return res.status(403).json({
                    success: false,
                    message: req.t('survey:access_denied_delete_department')
                });
            }
            
            // Check if survey has active participants (optional business logic)
            const hasActiveParticipants = survey.totalCount > 0;
            if (hasActiveParticipants) {
                console.log(`⚠️ Warning: Deleting survey #${survey.number} with ${survey.totalCount} participants`);
            }
            
            // Delete the survey using SurveyService with translation
            await SurveyService.deleteSurvey(quizId, req.t);
            
            // Log the action
            console.log(`🗑️ Servey "${survey.title}" (Number: ${survey.number}, ID: ${quizId}) deleted from ${survey.roomCode?.toUpperCase()} department by user ${req.session.user.email}`);
            
            res.json({
                success: true,
                message: req.t('survey:survey_number_deleted', { number: survey.number })
            });
            
        } catch (error) {
            console.error('Delete survey error:', error);
            res.status(500).json({
                success: false,
                message: req.t('survey:failed_delete_survey'),
                error: process.env.NODE_ENV === 'development' ? error.message : req.t('error:server_error')
            });
        }
    }
}
function cloneImage(quiz) {
    if (!quiz.questions) return quiz;
    const projectRoot = process.cwd(); // thường là nơi chứa server.js/app.js
    const publicDir = path.join(projectRoot, 'public');
    const imageDir = path.join(publicDir, 'uploads', 'quiz_images');

    quiz.questions = quiz.questions.map(question => {
        if (question.image && typeof question.image === 'string') {
            try {
                const oldImagePath = path.join(publicDir, question.image.replace(/^\/+/, ''));
                const ext = path.extname(oldImagePath);
                const newFileName = `${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`;
                const newRelativePath = `/uploads/quiz_images/${newFileName}`;
                const newImagePath = path.join(imageDir, newFileName);

                if (fs.existsSync(oldImagePath)) {
                    fs.copyFileSync(oldImagePath, newImagePath);
                    question.image = newRelativePath;
                } else {
                    console.warn(`Image not found: ${oldImagePath}`);
                }
            } catch (err) {
                console.error('Error copying image:', err);
            }
        }

        return question;
    });

    return quiz;    
}
module.exports = new SurveyController();