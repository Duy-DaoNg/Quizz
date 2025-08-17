const Survey = require('../models/survey.model');
const fs = require('fs');
const path = require('path');

class SurveyService {
    async createSurvey(quizData, files, t = null) {
        try {
            // Default translation function
            const translate = t || ((key, options = {}) => {
                const messages = {
                    'survey:room_code_required': 'Valid room code is required (e.g., hrm, hse,...)',
                    'survey:survey_created': 'Survey "{{title}}" (Number: {{number}}) created successfully for {{department}} department with {{questionCount}} questions',
                    'survey:create_survey_error': 'Error creating survey: {{error}}'
                };
                let message = messages[key] || key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });

            const quizInfo = JSON.parse(quizData.quizInfo);
            const questionsData = JSON.parse(quizData.questionsData);
            
            // Validate room code (REQUIRED for new quizzes)
            if (!quizInfo.roomCode || !['hrm', 'hse', 'gm', 'qaqs', 'sm', 'fol', 'eol', 'it', 'mkt', 'eng', 'wh', 'log', 'pnp', 'acc'].includes(quizInfo.roomCode)) {
                throw new Error(translate('survey:room_code_required'));
            }
            
            // Process images and save paths
            const processedQuestions = questionsData.map(question => {
                let imagePath = null;
                if (!question.imagePath || question.imagePath.trim().length < 1) {
                    const imageKey = `questionImage_${question.number}`;
                    let imageFile = null;
                    
                    // Find the correct image file
                    if (files) {
                        if (Array.isArray(files)) {
                            imageFile = files.find(f => f.fieldname === imageKey);
                        } else if (typeof files === 'object') {
                            imageFile = Object.values(files).flat().find(f => f.fieldname === imageKey);
                        }
                    }

                    
                    if (imageFile && imageFile.path) {
                        try {
                            const pathParts = imageFile.path.split('public');
                            if (pathParts.length > 1) {
                                imagePath = '/' + pathParts[1].replace(/\\/g, '/');
                                if (imagePath.startsWith('//')) {
                                    imagePath = imagePath.substring(1);
                                }
                            }
                        } catch (error) {
                            imagePath = null;
                        }
                    }
                } else {
                    console.log('Using provided image path:', question.imagePath);
                    imagePath = question.imagePath;
                }
                
                return {
                    number: question.number,
                    content: question.content.trim(),
                    image: imagePath,
                    answer: ""
                };
            });
            
            // Calculate total duration
            const totalDuration = processedQuestions.reduce((sum, q) => sum + 0, 0);
            
            // Create survey document with new schema including roomCode
            const survey = new Survey({
                title: quizInfo.title.trim(),
                mode: quizInfo.mode,
                roomCode: quizInfo.roomCode,
                testDuration: quizInfo.testDuration,
                questions: processedQuestions,
                createdBy: null,
                metadata: {
                    totalDuration: totalDuration,
                    version: '2.0',
                    estimatedDuration: this.formatDuration(quizInfo.testDuration * 60),
                    lastModified: new Date()
                }
            });
            
            await survey.save();
            
            console.log(translate('survey:survey_created', {
                title: survey.title,
                number: survey.number,
                department: survey.roomCode.toUpperCase(),
                questionCount: processedQuestions.length
            }));
            
            return survey;
            
        } catch (error) {
            console.error('Error creating survey:', error);
            // Delete uploaded files if error occurs
            if (files) {
                const filesToDelete = Array.isArray(files) ? files : Object.values(files).flat();
                filesToDelete.forEach(file => {
                    if (file && file.path) {
                        fs.unlink(file.path, err => {
                            if (err) console.error('Error deleting file:', err);
                        });
                    }
                });
            }
            
            const translate = t || ((key, options = {}) => {
                let message = key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });
            
            throw new Error(translate('survey:create_survey_error', { error: error.message }));
        }
    }

    async getSurvey(id, t = null) {
        try {
            const translate = t || ((key) => {
                const messages = {
                    'survey:survey_not_found': 'Survey not found',
                    'survey:get_survey_error': 'Error getting survey: {{error}}'
                };
                return messages[key] || key;
            });

            const survey = await Survey.findById(id);
            if (!survey) {
                throw new Error(translate('survey:survey_not_found'));
            }
            return survey;
        } catch (error) {
            const translate = t || ((key, options = {}) => {
                let message = key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });
            throw new Error(translate('survey:get_survey_error', { error: error.message }));
        }
    }

    // Get surveys by room code
    async getSurveysByRoom(roomCode, t = null) {
        try {
            const translate = t || ((key, options = {}) => {
                const messages = {
                    'surveys:valid_room_code_required': 'Valid room code is required',
                    'surveys:fetch_surveys_error': 'Error fetching surveys for room {{roomCode}}: {{error}}'
                };
                let message = messages[key] || key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });

            if (!roomCode || !['hrm', 'hse', 'gm', 'qaqs', 'sm', 'fol', 'eol', 'it', 'mkt', 'eng', 'wh', 'log', 'pnp', 'acc'].includes(roomCode)) {
                throw new Error(translate('survey:valid_room_code_required'));
            }
            
            const surveys = await Survey.find({ roomCode: roomCode })
                .select('number title questions scheduleSettings createdAt updatedAt metadata roomCode')
                .sort({ number: -1 }); // Sort by survey number descending

            return surveys;
        } catch (error) {
            const translate = t || ((key, options = {}) => {
                let message = key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });
            throw new Error(translate('survey:fetch_surveys_error', { 
                roomCode: roomCode, 
                error: error.message 
            }));
        }
    }

    async updateSurvey(id, quizData, files, t = null) {
        try {
            const translate = t || ((key, options = {}) => {
                const messages = {
                    'survey:survey_not_found': 'Survey not found',
                    'survey:survey_updated': 'Survey "{{title}}" (Number: {{number}}) updated successfully in {{department}} department',
                    'survey:update_survey_error': 'Error updating survey: {{error}}'
                };
                let message = messages[key] || key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });

            const survey = await Survey.findById(id);
            if (!survey) {
                throw new Error(translate('survey:survey_not_found'));
            }

            const quizInfo = JSON.parse(quizData.quizInfo);
            const questionsData = JSON.parse(quizData.questionsData);
            
            // Preserve existing roomCode if not provided (for backward compatibility)
            let roomCode = survey.roomCode;
            if (quizInfo.roomCode && ['hrm', 'hse', 'gm', 'qaqs', 'sm', 'fol', 'eol', 'it', 'mkt', 'eng', 'wh', 'log', 'pnp', 'acc'].includes(quizInfo.roomCode)) {
                roomCode = quizInfo.roomCode;
            }
            
            // Process images and save paths (similar to createQuiz)
            const processedQuestions = questionsData.map(question => {
                // [Image processing logic - same as in createQuiz]
                const imageKey = `questionImage_${question.number}`;
                let imageFile = null;
                
                if (files) {
                    if (Array.isArray(files)) {
                        imageFile = files.find(f => f.fieldname === imageKey);
                    } else if (typeof files === 'object') {
                        imageFile = Object.values(files).flat().find(f => f.fieldname === imageKey);
                    }
                }

                let imagePath = null;

                // Handle new image upload
                if (imageFile && imageFile.path) {
                    try {
                        const pathParts = imageFile.path.split('public');
                        if (pathParts.length > 1 && pathParts[1]) {
                            imagePath = pathParts[1].replace(/\\/g, '/');
                            if (!imagePath.startsWith('/')) {
                                imagePath = '/' + imagePath;
                            }
                            imagePath = imagePath.replace(/\/+/g, '/');
                        } else {
                            const filename = path.basename(imageFile.path);
                            imagePath = `/uploads/quiz_images/${filename}`;
                        }
                        
                        // Delete old image if exists
                        const oldQuestion = survey.questions.find(q => q.number === question.number);
                        if (oldQuestion?.image) {
                            const oldImagePath = path.join(__dirname, '../public', oldQuestion.image);
                            fs.unlink(oldImagePath, err => {
                                if (err) console.log('Note: Could not delete old image:', err.message);
                            });
                        }
                    } catch (error) {
                        console.error('Error processing image path:', error);
                        imagePath = null;
                    }
                } else {
                    // Keep existing image or remove it
                    const existingQuestion = survey.questions.find(q => q.number === question.number);
                    if (question.image === null || question.image === '') {
                        // Image was removed
                        if (existingQuestion?.image) {
                            const oldImagePath = path.join(__dirname, '../public', existingQuestion.image);
                            fs.unlink(oldImagePath, err => {
                                if (err) console.log('Note: Could not delete removed image:', err.message);
                            });
                        }
                        imagePath = null;
                    } else {
                        // Keep existing image
                        imagePath = existingQuestion?.image || null;
                    }
                }

                return {
                    number: question.number,
                    content: question.content.trim(),
                    image: imagePath,
                    answer: ""
                };
            });

            // Handle deleted questions' images
            survey.questions.forEach(oldQuestion => {
                const stillExists = processedQuestions.some(q => q.number === oldQuestion.number);
                if (!stillExists && oldQuestion.image) {
                    const oldImagePath = path.join(__dirname, '../public', oldQuestion.image);
                    fs.unlink(oldImagePath, err => {
                        if (err) console.error('Error deleting removed question image:', err);
                    });
                }
            });

            // Calculate new total duration
            const totalDuration = processedQuestions.reduce((sum, q) => sum + 0, 0);

            // Update quiz document with roomCode (preserve quiz.number - don't change it)
            const updatedSurvey = await Survey.findByIdAndUpdate(
                id,
                {
                    title: quizInfo.title.trim(),
                    roomCode: roomCode,
                    scheduleSettings: quizInfo.scheduleSettings,
                    // Cập nhật testDuration cho mode offline
                    testDuration: quizInfo.testDuration,
                    questions: processedQuestions,
                    'metadata.totalDuration': totalDuration,
                    'metadata.lastModified': new Date(),
                    'metadata.estimatedDuration': this.formatDuration(quizInfo.testDuration * 60),
                    'metadata.version': '2.0'
                },
                {
                    new: true,
                    runValidators: true
                }
            );

            console.log(translate('survey:survey_updated', {
                title: updatedSurvey.title,
                number: updatedSurvey.number,
                department: roomCode?.toUpperCase()
            }));
            
            return updatedSurvey;

        } catch (error) {
            // Delete uploaded files if error occurs
            if (files) {
                const filesToDelete = Array.isArray(files) ? files : Object.values(files).flat();
                filesToDelete.forEach(file => {
                    if (file && file.path) {
                        fs.unlink(file.path, err => {
                            if (err) console.error('Error deleting file:', err);
                        });
                    }
                });
            }
            
            const translate = t || ((key, options = {}) => {
                let message = key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });
            
            throw new Error(translate('survey:update_survey_error', { error: error.message }));
        }
    }

    async deleteSurvey(id, t = null) {
        try {
            const translate = t || ((key, options = {}) => {
                const messages = {
                    'survey:survey_not_found': 'Survey not found',
                    'survey:survey_deleted': 'Survey "{{title}}" (Number: {{number}}) deleted successfully from {{department}} department',
                    'survey:delete_survey_error': 'Error deleting survey: {{error}}'
                };
                let message = messages[key] || key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });

            const survey = await Survey.findById(id);
            if (!survey) {
                throw new Error(translate('survey:survey_not_found'));
            }

            // Delete associated images from local storage
            survey.questions.forEach(question => {
                if (question.image) {
                    const imagePath = path.join(__dirname, '../public', question.image);
                    fs.unlink(imagePath, err => {
                        if (err) console.error('Error deleting image:', err);
                    });
                }
            });

            await Survey.findByIdAndDelete(id);
            
            console.log(translate('survey:survey_deleted', {
                title: survey.title,
                number: survey.number,
                department: survey.roomCode?.toUpperCase()
            }));
            
            return { 
                message: translate('survey:survey_deleted', {
                    title: survey.title,
                    number: survey.number,
                    department: survey.roomCode?.toUpperCase()
                })
            };
        } catch (error) {
            const translate = t || ((key, options = {}) => {
                let message = key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });
            throw new Error(translate('survey:delete_survey_error', { error: error.message }));
        }
    }

    async getAllSurveys(t = null) {
        try {
            const translate = t || ((key, options = {}) => {
                const messages = {
                    'survey:fetch_all_surveys_error': 'Error fetching surveys: {{error}}'
                };
                let message = messages[key] || key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });

            const surveys = await Survey.find()
                .select('number title roomCode questions scheduleSettings createdAt updatedAt metadata testDuration')
                .sort({updatedAt: -1,  number: 1}); // Sort by survey number ascending

            return surveys.map(survey => {
                const surveyObject = survey.toObject();
                // Calculate enhanced statistics
                const questionCount = survey.questions.length;
                const hasImages = survey.questions.some(q => q.image);
                const totalDuration = survey.questions.reduce((sum, q) => sum + 0, 0);
                
                return {
                    ...surveyObject,
                    // Include survey number in returned data
                    number: survey.number,
                    questionCount: questionCount,
                    completedCount: 0, // TODO: Implement completion tracking
                    totalCount: 0,     // TODO: Implement participant counting
                    averageScore: 0,   // TODO: Implement score tracking
                    formattedDate: new Date(survey.updatedAt).toLocaleDateString(),
                    // Enhanced metadata
                    hasImages: hasImages,
                    totalDuration: totalDuration,
                    formattedDuration: this.formatDuration(totalDuration),
                    isRecent: this.isRecentlyUpdated(survey.updatedAt),
                    status: this.getSurveyStatus(survey),
                    version: surveyObject.metadata?.version || '1.0',
                    // Room information
                    roomName: this.getRoomName(survey.roomCode)
                };
            });
        } catch (error) {
            const translate = t || ((key, options = {}) => {
                let message = key;
                Object.keys(options).forEach(placeholder => {
                    message = message.replace(`{{${placeholder}}}`, options[placeholder]);
                });
                return message;
            });
            throw new Error(translate('survey:fetch_all_surveys_error', { error: error.message }));
        }
    }

    // Get quiz statistics by room

    // Helper method to get room name
    getRoomName(roomCode) {
        const roomNames = {
            "hrm": "Human Resource Management",
            "hse": "Health, Safety & Environment",
            "gm": "General Management",
            "qaqs": "Quality Assurance & Quality System",
            "sm": "Sales Marketing",
            "fol": "SX-FOL",
            "eol": "SX-EOL",
            "it": "Information Technology",
            "mkt": "Marketing",
            "eng": "Engineering",
            "wh": "Warehouse",
            "log": "Logistic",
            "pnp": "Procurement - Planning",
            "acc": "Accounting"
        };
        return roomNames[roomCode] || roomCode?.toUpperCase() || 'Unknown';
    }

    // Helper methods for enhanced functionality
    formatDuration(totalSeconds) {
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

    isRecentlyUpdated(updatedAt) {
        const daysDiff = Math.floor((new Date() - new Date(updatedAt)) / (1000 * 60 * 60 * 24));
        return daysDiff <= 7;
    }

    getSurveyStatus(survey) {
        if (!survey.scheduleSettings) {
            return 'active'; // Online surveyzes are always active
        }
        
        const now = new Date();
        const startTime = new Date(survey.scheduleSettings.startTime);
        const endTime = new Date(survey.scheduleSettings.endTime);
        
        if (now < startTime) {
            return 'scheduled';
        } else if (now >= startTime && now <= endTime) {
            return 'active';
        } else {
            return 'expired';
        }
    }
}

module.exports = new SurveyService();