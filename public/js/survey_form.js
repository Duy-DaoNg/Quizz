// Unified Quiz Form JavaScript for Create & Edit (With i18n Support) - UPDATED WITH ANSWER REVEAL
let questions = [];
let questionCount = 0;
let autoSaveTimer;
let hasUnsavedChanges = false;
let isEditMode = false;
let quizId = null;

// Preview variables
let currentPreviewQuestion = 0;
let previewTimer = null;
let timeRemaining = 0;
let isTimerActive = false;
let selectedAnswer = null; // Track user's selected answer

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
const DEFAULT_ANSWER_TIME = 30;

// Get translations from global object
const t = window.translations || {};

document.addEventListener('DOMContentLoaded', function() {
    initializeSurveyForm();
});

// =================== INITIALIZATION ===================

function initializeSurveyForm() {
    // Get configuration from global variable
    const config = window.quizFormConfig;
    isEditMode = config.isEdit;
    quizId = config.quizId;
    
    if (isEditMode && config.initialData) {
        loadInitialData(config.initialData);
    } else {
        // Create mode - load draft if exists
        loadDraftIfExists();
    }
    
    setupEventListeners();
    setupAutoSave();
    updateSurveyStatistics();
}

function loadInitialData(data) {
    // Load quiz info (removed language)
    document.getElementById('quizTitle').value = data.title || '';
    
    if (data.scheduleSettings) {
        const startTime = data.scheduleSettings.startTime;
        const endTime = data.scheduleSettings.endTime;
        if (startTime) document.getElementById('startTime').value = new Date(startTime).toISOString().slice(0, 16);
        if (endTime) document.getElementById('endTime').value = new Date(endTime).toISOString().slice(0, 16);
    }
    
    if (data.testDuration) {
        document.getElementById('testDuration').value = data.testDuration;
    }
    
    // Load questions
    questions = data.questions.map((q, index) => ({
        id: index + 1,
        content: q.content || '',
        answer: q.answer || '',
        image: q.image ? {
            preview: q.image,
            file: null
        } : null
    }));
    
    questionCount = questions.length;
    renderAllQuestions();
    updateSurveyStatistics();
}

function setupEventListeners() {
    // Quiz info changes (removed quizLanguage)
    ['quizTitle', 'quizMode', 'startTime', 'endTime'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', () => {
                triggerAutoSave();
                updateSurveyStatistics();
            });
            element.addEventListener('change', () => {
                triggerAutoSave();
                updateSurveyStatistics();
            });
        }
    });

    // Add test duration change listener
    const testDurationEl = document.getElementById('testDuration');
    if (testDurationEl) {
        testDurationEl.addEventListener('input', () => {
            triggerAutoSave();
            updateSurveyStatistics();
        });
    }
}

// =================== QUESTION MANAGEMENT ===================

function addQuestion() {
    questionCount++;
    const newQuestion = {
        id: questionCount,
        content: '',
        image: null
    };
    
    questions.push(newQuestion);
    renderQuestion(newQuestion);
    updateSurveyStatistics();
    triggerAutoSave();
    
    // Scroll to new question
    setTimeout(() => {
        const element = document.getElementById(`question-${questionCount}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
}

function renderQuestion(question) {
    const container = document.getElementById('questionsContainer');
    const questionHtml = createQuestionHtml(question);
    
    // Remove add button temporarily
    const addBtn = container.querySelector('.add-question-btn');
    if (addBtn) {
        addBtn.remove();
    }
    
    container.insertAdjacentHTML('beforeend', questionHtml);
    
    // Apply color classes after DOM insertion
    setTimeout(() => {
        populateQuestionData(question);
    }, 0);
}

function renderAllQuestions() {
    const container = document.getElementById('questionsContainer');
    container.innerHTML = '';
    
    questions.forEach(question => {
        renderQuestion(question);
    });
}

function createQuestionHtml(question) {
    
    return `
        <div class="question-card-modern animate-slide-up" id="question-${question.id}">
            <div class="question-header">
                <div class="d-flex align-items-center flex-grow-1">
                    <div class="question-number">${question.id}</div>
                    <h5 class="mb-0">${t.question || 'Question'} ${question.id}</h5>
                </div>
                
                <div class="question-actions">
                    <button class="action-btn" onclick="moveQuestion(${question.id}, 'up')" title="${t.moveUp || 'Move Up'}" type="button">
                        <i class="fas fa-arrow-up"></i>
                    </button>
                    <button class="action-btn" onclick="moveQuestion(${question.id}, 'down')" title="${t.moveDown || 'Move Down'}" type="button">
                        <i class="fas fa-arrow-down"></i>
                    </button>
                    <button class="action-btn" onclick="duplicateQuestion(${question.id})" title="${t.duplicate || 'Duplicate'}" type="button">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="action-btn danger" onclick="deleteQuestion(${question.id})" title="${t.delete || 'Delete'}" type="button">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            
            <div class="card-body-modern">
                <div class="row">
                    <div class="col-lg-8">
                        <div class="form-floating-modern">
                            <textarea class="form-control-modern" 
                                      id="question-${question.id}-content" 
                                      placeholder=" " 
                                      rows="3" 
                                      oninput="updateQuestion(${question.id}, 'content', this.value)">${question.content}</textarea>
                            <label class="form-label-modern">${t.questionContent || 'Question Content'}</label>
                        </div>
                    </div>
                    
                    <div class="col-lg-4">
                        <div class="image-upload-zone ${question.image ? 'has-image' : ''}" 
                             onclick="document.getElementById('image-${question.id}').click()">
                            <input type="file" 
                                   id="image-${question.id}" 
                                   accept="image/*" 
                                   style="display: none;" 
                                   onchange="handleImageUpload(${question.id}, this)">
                            ${question.image ? 
                                `<img src="${question.image.preview}" alt="Question Image" 
                                     style="max-width: 100%; max-height: 200px; border-radius: 8px;">
                                 <div class="mt-2">
                                     <button class="btn btn-sm btn-outline-danger" 
                                             onclick="removeImage(${question.id}, event)" type="button">
                                         <i class="fas fa-trash me-1"></i> ${t.remove || 'Remove'}
                                     </button>
                                 </div>` :
                                `<div class="upload-content">
                                     <div class="upload-icon">
                                         <i class="fas fa-cloud-upload-alt"></i>
                                     </div>
                                     <h6>${t.uploadImage || 'Upload Image'}</h6>
                                     <p class="text-muted small mb-0">${t.clickSelectImage || 'Click to select image'}</p>
                                 </div>`
                            }
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function populateQuestionData(question) {
    // Content
    const contentEl = document.getElementById(`question-${question.id}-content`);
    if (contentEl) contentEl.value = question.content;
    
    // Restore image preview if available
    if (question.image && question.image.preview) {
        const uploadZone = document.querySelector(`#question-${question.id} .image-upload-zone`);
        if (uploadZone) {
            uploadZone.classList.add('has-image');
            uploadZone.innerHTML = `
                <input type="file"
                        id="image-${question.id}"
                        accept="image/*"
                        style="display: none;"
                        onchange="handleImageUpload(${question.id}, this)">
                <img src="${question.image.preview}" alt="Question Image" 
                        style="max-width: 100%; max-height: 200px; border-radius: 8px;">
                <div class="mt-2">
                    <button class="btn btn-sm btn-outline-danger" 
                            onclick="removeImage(${question.id}, event)" type="button">
                        <i class="fas fa-trash me-1"></i> ${t.remove || 'Remove'}
                    </button>
                </div>
            `;
        }
    }
}

// =================== OPTION MANAGEMENT ===================

// =================== UPDATE FUNCTIONS ===================

function updateQuestion(questionId, field, value) {
    const question = questions.find(q => q.id === questionId);
    if (!question) return;
    question[field] = value;
    
    updateSurveyStatistics();
    triggerAutoSave();
}

function updateSurveyStatistics() {
    const questionCountEl = document.getElementById('questionCount');
    const totalDurationEl = document.getElementById('totalDuration');
    
    if (questionCountEl) {
        questionCountEl.textContent = questions.length;
    }
}

// =================== IMAGE HANDLING ===================

function handleImageUpload(questionId, input) {
    if (!input.files || !input.files[0]) return;
    
    const file = input.files[0];
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const question = questions.find(q => q.id === questionId);
        if (question) {
            question.image = {
                file: file,
                preview: e.target.result
            };
            
            const uploadZone = document.querySelector(`#question-${questionId} .image-upload-zone`);
            if (uploadZone) {
                uploadZone.classList.add('has-image');
                uploadZone.innerHTML = `
                    <img src="${e.target.result}" alt="Question Image" 
                         style="max-width: 100%; max-height: 200px; border-radius: 8px;">
                    <div class="mt-2">
                        <button class="btn btn-sm btn-outline-danger" 
                                onclick="removeImage(${questionId}, event)" type="button">
                            <i class="fas fa-trash me-1"></i> ${t.remove || 'Remove'}
                        </button>
                    </div>
                `;
            }
            triggerAutoSave();
        }
    };
    
    reader.readAsDataURL(file);
}

function removeImage(questionId, event) {
    if (event) event.stopPropagation();
    
    const question = questions.find(q => q.id === questionId);
    if (question) {
        question.image = null;
        const uploadZone = document.querySelector(`#question-${questionId} .image-upload-zone`);
        if (uploadZone) {
            uploadZone.classList.remove('has-image');
            uploadZone.innerHTML = `
                <input type="file" 
                       id="image-${questionId}" 
                       accept="image/*" 
                       style="display: none;" 
                       onchange="handleImageUpload(${questionId}, this)">
                <div class="upload-content">
                    <div class="upload-icon">
                        <i class="fas fa-cloud-upload-alt"></i>
                    </div>
                    <h6>${t.uploadImage || 'Upload Image'}</h6>
                    <p class="text-muted small mb-0">${t.clickSelectImage || 'Click to select image'}</p>
                </div>
            `;
        }
        triggerAutoSave();
    }
}

// =================== QUESTION OPERATIONS ===================

function moveQuestion(questionId, direction) {
    const idx = questions.findIndex(q => q.id === questionId);
    if (idx === -1) return;

    let newIdx = idx;
    if (direction === 'up' && idx > 0) {
        newIdx = idx - 1;
    } else if (direction === 'down' && idx < questions.length - 1) {
        newIdx = idx + 1;
    } else {
        const position = direction === 'up' ? t.top || 'top' : t.bottom || 'bottom';
        const msg = t.cannotMove ? 
            t.cannotMove.replace('{{direction}}', t[direction] || direction).replace('{{position}}', position) :
            `Cannot move ${direction}. Question is already at the ${position}.`;
        showNotification(msg, 'warning');
        return;
    }
    // Swap ids
    [questions[idx].id, questions[newIdx].id] = [questions[newIdx].id, questions[idx].id];
    // Swap questions
    [questions[idx], questions[newIdx]] = [questions[newIdx], questions[idx]];
    renderAllQuestions();
    triggerAutoSave();
    
    const msg = t.questionMoved ? 
        t.questionMoved.replace('{{direction}}', t[direction] || direction) :
        `Question moved ${direction} successfully!`;
    showNotification(msg, 'success');
}

function duplicateQuestion(questionId) {
    const idx = questions.findIndex(q => q.id === questionId);
    if (idx === -1) return;
    
    questionCount++;
    const original = questions[idx];
    
    const copyLabel = t.copy || 'Copy';
    const newQuestion = {
        id: questionCount,
        content: `${original.content} (${copyLabel})`,
        image: original.image ? {
            preview: original.image.preview,
            file: original.image.file
        } : null
    };
    
    // Handle image duplication
    setTimeout(() => {
        if (newQuestion.image && newQuestion.image.preview) {
            fetch(newQuestion.image.preview)
                .then(res => res.blob())
                .then(blob => {
                    const fileName = `question_${newQuestion.id}_image.png`;
                    const file = new File([blob], fileName, { type: blob.type || 'image/png' });
                    newQuestion.image.file = file;
                })
                .catch(err => {
                    console.error('Error creating file from image:', err);
                });
        }
    }, 100);
    
    questions.splice(idx + 1, 0, newQuestion);
    questions.forEach((q, i) => {
        q.id = i + 1; // Reassign IDs
    });
    renderAllQuestions();
    updateSurveyStatistics();
    triggerAutoSave();
    
    showNotification(t.questionDuplicated || 'Question duplicated successfully!', 'success');
}

/**
 * Color utility functions
 */

/**
 * Observer to apply colors to dynamically added elements
 */

function deleteQuestion(questionId) {
    Swal.fire({
        title: t.deleteQuestion || 'Delete Question?',
        text: t.deleteQuestionConfirm || 'Are you sure you want to delete this question? This action cannot be undone.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: t.yesDelete || 'Yes, Delete',
        cancelButtonText: t.cancel || 'Cancel'
    }).then((result) => {
        if (result.isConfirmed) {
            questions = questions.filter(q => q.id !== questionId);
            const element = document.getElementById(`question-${questionId}`);
            if (element) {
                element.remove();
            }
            questions.forEach((q, i) => {
                q.id = i + 1; // Reassign IDs
            });
            updateSurveyStatistics();
            triggerAutoSave();
            showNotification(t.questionDeleted || 'Question deleted successfully!', 'success');
        }
    });
}

// =================== AUTO-SAVE & DRAFT ===================

function setupAutoSave() {
    if (!isEditMode) {
        // Only auto-save in create mode
        setInterval(() => {
            if (hasUnsavedChanges) {
                saveDraft();
            }
        }, 30000);
    }
}

function triggerAutoSave() {
    hasUnsavedChanges = true;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        if (!isEditMode) {
            saveDraft();
        }
        // showAutoSaveIndicator();
    }, 2000);
}

function saveDraft() {
    if (isEditMode) return; // Don't save draft in edit mode
    
    const draftData = {
        title: document.getElementById('quizTitle').value,
        questions: questions.map(q => ({
            ...q,
            image: q.image ? { preview: q.image.preview } : null
        })),
        timestamp: new Date().toISOString()
    };
    
    localStorage.setItem('quiz_form_draft', JSON.stringify(draftData));
    hasUnsavedChanges = false;
}

function loadDraftIfExists() {
    if (isEditMode) return;
    
    const draft = localStorage.getItem('quiz_form_draft');
    if (draft) {
        try {
            const draftData = JSON.parse(draft);
            Swal.fire({
                title: t.draftFound || 'Draft Found',
                text: t.restoreDraftConfirm || 'Would you like to restore your previous draft?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#667eea',
                cancelButtonColor: '#64748b',
                confirmButtonText: t.restoreDraft || 'Restore Draft',
                cancelButtonText: t.startFresh || 'Start Fresh'
            }).then((result) => {
                if (result.isConfirmed) {
                    restoreDraft(draftData);
                } else {
                    localStorage.removeItem('quiz_form_draft');
                }
            });
        } catch (error) {
            console.error('Error loading draft:', error);
            localStorage.removeItem('quiz_form_draft');
        }
    }
}

function restoreDraft(draftData) {
    document.getElementById('quizTitle').value = draftData.title || '';
    
    questions = draftData.questions || [];
    questionCount = questions.length > 0 ? Math.max(...questions.map(q => q.id)) : 0;
    
    renderAllQuestions();
    questions.forEach(question => {
        setTimeout(() => {
            if (question.image && question.image.preview) {
                fetch(question.image.preview)
                        .then(res => res.blob())
                        .then(blob => {
                            const fileName = `question_${question.id}_image.png`;
                            const file = new File([blob], fileName, { type: blob.type || 'image/png' });
                            question.image.file = file;
                        })
                        .catch(err => {
                            console.error('Error creating file from image:', err);
                        });
            }

        },100);
    });
    updateSurveyStatistics();
    
    showNotification(t.draftRestored || 'Draft restored successfully!', 'success');
}

function showAutoSaveIndicator() {
    const indicator = document.getElementById('autoSaveIndicator');
    if (indicator) {
        indicator.classList.add('show');
        setTimeout(() => {
            indicator.classList.remove('show');
        }, 2000);
    }
}

// =================== NEW PREVIEW LOGIC ===================

/**
 * Initialize the preview modal with single question display
 */
function previewSurvey() {
    if (questions.length === 0) {
        showNotification(t.noQuestionsPreview || 'Please add at least one question to preview', 'warning');
        return;
    }
    
    // Reset preview state
    currentPreviewQuestion = 0;
    selectedAnswer = null;
    stopTimer();
    
    // Set quiz basic info
    document.getElementById('previewTitle').textContent = 
        document.getElementById('quizTitle').value || 'Untitled Survey';
    
    // Show current question
    displayCurrentQuestion();
    updateProgress();
    
}

/**
 * Display the current question in preview mode
 */
function displayCurrentQuestion() {
    if (currentPreviewQuestion >= questions.length) {
        finishSurvey();
        return;
    }
    
    const question = questions[currentPreviewQuestion];
    const container = document.getElementById('previewQuestionContainer');
    
    // Reset selected answer for new question
    selectedAnswer = null;
    
    // Update question progress indicator
    document.getElementById('previewQuestionProgress').textContent = 
        `${currentPreviewQuestion + 1} of ${questions.length}`;
    
    // Build question HTML
    let questionHTML = `
        <div class="preview-question-header">
            <div class="preview-question-number">${currentPreviewQuestion + 1}</div>
            <div class="preview-question-content">
                <h5 class="preview-question-title">${question.content || 'Untitled Question'}</h5>
            </div>
        </div>
    `;
    
    // Add image if exists
    if (question.image && question.image.preview) {
        questionHTML += `
            <div class="preview-question-image">
                <img src="${question.image.preview}" alt="Question Image">
            </div>
        `;
    }
    
    container.innerHTML = questionHTML;
    
    // Apply color classes after DOM insertion
    
    // Start timer for this question
    startQuestionTimer(question.answerTime || DEFAULT_ANSWER_TIME);
    
    // Update navigation buttons
    updateNavigationButtons();
}

/**
 * Enhanced option selection with tracking
 */

/**
 * Start the countdown timer for current question
 */
function startQuestionTimer(seconds) {
    timeRemaining = seconds;
    isTimerActive = true;
    
    // Hide next button initially
    document.getElementById('nextBtn').style.display = 'none';
    document.getElementById('finishBtn').style.display = 'none';
    
    updateTimerDisplay();
    
    previewTimer = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        
        if (timeRemaining <= 0) {
            stopTimer();
        }
    }, 1000);
}

/**
 * Stop the current timer
 */
function stopTimer() {
    if (previewTimer) {
        clearInterval(previewTimer);
        previewTimer = null;
    }
    isTimerActive = false;
}

/**
 * Update the timer display
 */
function updateTimerDisplay() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    
    document.getElementById('timerMinutes').textContent = minutes.toString().padStart(2, '0');
    document.getElementById('timerSeconds').textContent = seconds.toString().padStart(2, '0');
    
    // Update timer circle color based on time remaining
    const timerCircle = document.querySelector('.timer-circle');
    const totalTime = questions[currentPreviewQuestion]?.answerTime || DEFAULT_ANSWER_TIME;
    const percentageLeft = (timeRemaining / totalTime) * 100;
    
    timerCircle.classList.remove('warning', 'danger');
    
    if (percentageLeft <= 10) {
        timerCircle.classList.add('danger');
    } else if (percentageLeft <= 30) {
        timerCircle.classList.add('warning');
    }
}

/**
 * Move to next question
 */
function nextQuestion() {
    if (currentPreviewQuestion < questions.length - 1) {
        currentPreviewQuestion++;
        selectedAnswer = null; // Reset for next question
        displayCurrentQuestion();
        updateProgress();
    }
}

/**
 * Update navigation buttons visibility
 */
function updateNavigationButtons() {
    const nextBtn = document.getElementById('nextBtn');
    const finishBtn = document.getElementById('finishBtn');
    
    // Next and Finish buttons are controlled by timer
    nextBtn.style.display = 'none';
    finishBtn.style.display = 'none';
}

/**
 * Update progress bar
 */
function updateProgress() {
    const progress = ((currentPreviewQuestion + 1) / questions.length) * 100;
    const progressBar = document.getElementById('previewProgress');
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
        progressBar.setAttribute('aria-valuenow', progress);
    }
}

/**
 * Finish the quiz preview
 */
function finishSurvey() {
    stopTimer();
    
    const message = t.reviewedAllQuestions ? 
        t.reviewedAllQuestions.replace('{{count}}', questions.length) :
        `You've reviewed all ${questions.length} questions.`;
    
    Swal.fire({
        title: t.previewComplete || 'Survey Preview Complete!',
        text: message,
        icon: 'success',
        confirmButtonText: t.exitPreview || 'Close Preview',
        confirmButtonColor: '#667eea'
    }).then(() => {
        const modal = bootstrap.Modal.getInstance(document.getElementById('previewModal'));
        if (modal) modal.hide();
    });
}

/**
 * Close preview and return to editing
 */
function editSurvey() {
    stopTimer();
    const modal = bootstrap.Modal.getInstance(document.getElementById('previewModal'));
    if (modal) modal.hide();
}

// =================== SUBMIT FUNCTIONS ===================

function publishSurvey() {
    if (!validateSurveyData()) return;
    
    Swal.fire({
        title: t.publishConfirm || 'Publish Survey?',
        text: t.publishConfirmText || "Your survey will be available for students to take.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#64748b',
        confirmButtonText: t.yesPublish || 'Yes, publish it!'
    }).then((result) => {
        if (result.isConfirmed) {
            submitSurveyToServer(false);
        }
    });
}

function updateSurvey() {
    if (!validateSurveyData()) return;
    
    Swal.fire({
        title: t.updateConfirm || 'Update Survey?',
        text: t.updateConfirmText || "All changes will be saved.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#667eea',
        cancelButtonColor: '#64748b',
        confirmButtonText: t.yesUpdate || 'Yes, update it!'
    }).then((result) => {
        if (result.isConfirmed) {
            submitSurveyToServer(true);
        }
    });
}

function validateSurveyData() {
    const title = document.getElementById('quizTitle').value.trim();
    if (!title) {
        showNotification(t.enterSurveyTitle || 'Please enter a survey title', 'error');
        return false;
    }
    
    if (questions.length === 0) {
        showNotification(t.addAtLeastOneQuestion || 'Please add at least one question', 'error');
        return false;
    }
    
    for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        if (!question.content.trim()) {
            const msg = t.questionEmpty ? 
                t.questionEmpty.replace('{{number}}', i + 1) :
                `Question ${i + 1} is empty`;
            showNotification(msg, 'error');
            return false;
        }
    }
    
    return true;
}

function submitSurveyToServer(isUpdate) {
    const loadingTitle = isUpdate ? 
        (t.updating || 'Updating Survey...') : 
        (t.publishing || 'Publishing Survey...');
    const loadingText = isUpdate ? 
        (t.updatingText || 'Please wait while we save your changes.') : 
        (t.publishingText || 'Please wait while we publish your survey.');
    
    Swal.fire({
        title: loadingTitle,
        text: loadingText,
        allowOutsideClick: false,
        showConfirmButton: false,
        willOpen: () => Swal.showLoading()
    });

    // Prepare data (removed language)
    const quizInfo = {
        title: document.getElementById('quizTitle').value,
        testDuration: null
    };

    const testDuration = parseInt(document.getElementById('testDuration').value);
    if (testDuration && testDuration > 0) {
        quizInfo.testDuration = testDuration;
    } else {
        showNotification(t.invalidTestDuration || 'Please enter a valid test duration', 'error');
        return;
    }


    const questionsData = questions.map((question, index) => {
        const imgElement = document.querySelector(`#question-${index + 1} .image-upload-zone img`);
        let imageSrc = imgElement ? imgElement.src : null;
        if (imageSrc && imageSrc.includes('data:image')) {
            imageSrc = null
        }
        return {
            number: index + 1,
            content: question.content,
            answer: "",
            image: imageSrc
        };
    });
    // Create FormData
    const formData = new FormData();
    formData.append('quizInfo', JSON.stringify(quizInfo));
    formData.append('questionsData', JSON.stringify(questionsData));

    // Add image files
    questions.forEach((question, index) => {
        if (question.image && question.image.file) {
            formData.append(`questionImage_${index + 1}`, question.image.file);
        }
    });

    // Submit
    const url = isUpdate ? `/surveys/${quizId}` : '/surveys';
    const method = isUpdate ? 'PUT' : 'POST';

    fetch(url, { method, body: formData })
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(data.error || 'Network response was not ok');
                });
            }
            return response.json;
        })
        .then(data => {
            if (!isUpdate) {
                localStorage.removeItem('quiz_form_draft');
            }
            
            const successTitle = isUpdate ? 
                (t.surveyUpdated || 'Survey Updated!') : 
                (t.surveyPublished || 'Survey Published!');
            const successText = isUpdate ? 
                (t.surveyUpdatedText || 'Your survey has been updated successfully.') : 
                (t.surveyPublishedText || 'Your survey has been published successfully.');
            
            Swal.fire({
                title: successTitle,
                text: successText,
                icon: 'success',
                confirmButtonText: t.viewSurveyDashboard || 'View Survey Dashboard'
            }).then(() => {
                window.location.href = '/surveys';
            });
        })
        .catch(error => {
            console.error('Error:', error);
            Swal.fire({
                icon: 'error',
                title: t.error || 'Error!',
                text: error.message || (t.failedSaveSurvey || 'Failed to save survey. Please try again.'),
                confirmButtonColor: '#667eea'
            });
        });
}

// =================== UTILITY FUNCTIONS ===================

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        z-index: 9999;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        max-width: 350px;
        animation: slideInRight 0.3s ease-out;
        backdrop-filter: blur(10px);
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
    `;
    
    const colors = {
        success: 'linear-gradient(135deg, #10b981, #059669)',
        error: 'linear-gradient(135deg, #ef4444, #dc2626)',
        warning: 'linear-gradient(135deg, #f59e0b, #d97706)',
        info: 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
    };
    
    notification.style.background = colors[type] || colors.info;
    
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    
    notification.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="${icons[type] || icons.info} me-2"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Add CSS animations
if (!document.querySelector('#notificationStyles')) {
    const style = document.createElement('style');
    style.id = 'notificationStyles';
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// Export functions for global access
window.addQuestion = addQuestion;
window.updateQuestion = updateQuestion;
window.handleImageUpload = handleImageUpload;
window.removeImage = removeImage;
window.moveQuestion = moveQuestion;
window.duplicateQuestion = duplicateQuestion;
window.deleteQuestion = deleteQuestion;
window.previewSurvey = previewSurvey;
window.editSurvey = editSurvey;
window.publishSurvey = publishSurvey;
window.updateSurvey = updateSurvey;
window.nextQuestion = nextQuestion;
window.finishSurvey = finishSurvey;