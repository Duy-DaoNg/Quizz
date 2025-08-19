const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const app = express();

// Create HTTP server and Socket.IO
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const connectDB = require('./config/db.mongdb.cloud');
const multer = require('multer');

// Import i18n-enabled services
const AuthService = require('./services/auth.service');
const PlayerService = require('./services/player.service');
const QuizService = require('./services/quiz.service');
const TestService = require('./services/test.service');

const TestSocketHandler = require('./sockets/test.socket');
const i18next = require('./config/i18n');
const i18nextMiddleware = require('i18next-http-middleware');

// Import i18n middleware
const { 
    i18nMiddleware, 
    languageSwitchMiddleware, 
    errorHandler 
} = require('./middlewares/i18n.middleware');

require('dotenv').config();

// Body parser middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'quiz-app-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        touchAfter: 24 * 3600 // lazy session update
    }),
    cookie: {
        secure: false, // Set to true if using HTTPS
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// IMPORTANT: i18n middleware setup
app.use(i18nextMiddleware.handle(i18next));
app.use(languageSwitchMiddleware); // Handle language switching
app.use(i18nMiddleware); // Enhanced i18n helpers

// Make user available in all templates
app.use((req, res, next) => {
    res.locals.user = req.session ? req.session.user : null;
    
    // Additional i18n helpers for templates (enhanced by i18nMiddleware)
    res.locals.t = req.t;
    res.locals.lng = req.language;
    res.locals.languages = ['vi', 'en'];
    
    // Enhanced translation function with interpolation
    res.locals.ti = function(key, options = {}) {
        let translation = req.t(key);
        
        // Simple interpolation
        if (options && typeof options === 'object') {
            Object.keys(options).forEach(placeholder => {
                const regex = new RegExp(`{{${placeholder}}}`, 'g');
                translation = translation.replace(regex, options[placeholder]);
            });
        }
        
        return translation;
    };
    
    next();
});

// EJS setup
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main');

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Socket.IO for real-time tests
const testSocketHandler = new TestSocketHandler(io);

// Connect to MongoDB and create initial admin user
connectDB().then(async () => {
    try {
        // Create initial admin and demo users using i18n-enabled service
        const defaultTranslate = (key, options = {}) => {
            let message = key;
            Object.keys(options).forEach(placeholder => {
                message = message.replace(`{{${placeholder}}}`, options[placeholder]);
            });
            return message;
        };
        
        await AuthService.createInitialAdmin(defaultTranslate);
        
        // Start test cleanup scheduler
        console.log('🧹 Starting test cleanup scheduler...');
        setInterval(async () => {
            try {
                const cleanedCount = 0; // await TestService.cleanupExpiredTests();
                if (cleanedCount > 0) {
                    console.log(`🧹 Cleaned up ${cleanedCount} expired tests`);
                }
            } catch (error) {
                console.error('Test cleanup error:', error);
            }
        }, 60 * 60 * 1000); // Run every hour
        
    } catch (error) {
        console.error('❌ Error setting up initial users:', error);
    }
});

// Routes
const quizRoutes = require('./routes/quiz.route');
const authRoutes = require('./routes/auth.route');
const testRoutes = require('./routes/test.route');
const surveyRoutes = require('./routes/survey.route');
const publicSurveyRoutes = require('./routes/survey.public.route');
const { requireAuth, requireAdmin } = require('./controllers/auth.controller');

// Auth routes (no middleware needed)
app.use('/auth', authRoutes);

// Test routes (public and authenticated)
app.use('/test', testRoutes);

app.use('/publicsurvey', publicSurveyRoutes);

// Quiz operation logging middleware
app.use('/quizzes', (req, res, next) => {
    const user = req.session?.user;
    const operation = `${req.method} ${req.path}`;
    
    // Log quiz operations for audit trail
    if (user && ['POST', 'PUT', 'DELETE'].includes(req.method)) {
        console.log(`Quiz Operation: ${operation} by ${user.email} at ${new Date().toISOString()}`);
    }
    
    next();
});
app.use('/surveys', (req, res, next) => {
    const user = req.session?.user;
    const operation = `${req.method} ${req.path}`;
    
    // Log quiz operations for audit trail
    if (user && ['POST', 'PUT', 'DELETE'].includes(req.method)) {
        console.log(`Survey Operation: ${operation} by ${user.email} at ${new Date().toISOString()}`);
    }
    
    next();
});

// Protected routes (require authentication AND admin role)
app.use('/quizzes', requireAuth, requireAdmin, quizRoutes);
app.use('/surveys', requireAuth, requireAdmin, surveyRoutes);

// ========================================
// ENHANCED API ROUTES FOR QUIZ MANAGEMENT WITH I18N
// ========================================

// ========================================
// ROOT ROUTE WITH I18N
// ========================================
app.get('/', (req, res) => {
    if (req.session && req.session.user) {
        // Redirect based on role
        if (req.session.user.role === 'admin') {
            res.redirect('/quizzes');
        } else if (req.session.user.role === 'player') {
            res.redirect('/player/dashboard');
        } else {
            res.redirect('/auth/login');
        }
    } else {
        res.redirect('/auth/login');
    }
});

// ========================================
// ERROR HANDLING MIDDLEWARE WITH I18N
// ========================================
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                error: req.t('validation:file_size_limit', { max: 5 })
            });
        }
    }
    next(error);
});

// Global error handler with i18n support
app.use(errorHandler);

// 404 handler with i18n
app.use((req, res) => {
    res.status(404).send(`
        <!DOCTYPE html>
        <html lang="${req.language || 'en'}">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>404 - ${req.t('error:page_not_found')}</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
            <style>
                body { 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-family: 'Inter', sans-serif;
                }
                .error-container { text-align: center; }
                .error-code { font-size: 5rem; font-weight: bold; margin-bottom: 1rem; }
                .btn-home { 
                    background: rgba(255,255,255,0.2);
                    border: 2px solid white;
                    color: white;
                    padding: 0.75rem 2rem;
                    border-radius: 50px;
                    text-decoration: none;
                    margin-top: 2rem;
                    display: inline-block;
                }
                .btn-home:hover { background: white; color: #667eea; }
            </style>
        </head>
        <body>
            <div class="error-container">
                <div class="error-code">404</div>
                <h2>${req.t('error:page_not_found')}</h2>
                <p>${req.t('error:page_not_found_desc')}</p>
                <a href="/" class="btn-home">${req.t('common:go_home')}</a>
            </div>
        </body>
        </html>
    `);
});

// ========================================
// SERVER STARTUP WITH I18N MESSAGES
// ========================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`🔌 Socket.IO server ready for real-time tests`);
    console.log(`🌍 i18n support enabled (Vietnamese/English)`);
    console.log(`\n👤 Demo credentials:`);
    console.log(`   🔑 Admin: admin@quizapp.com / admin123`);
    console.log(`\n📝 Features:`);
    console.log(`   ✅ Full internationalization (i18n) support`);
    console.log(`   ✅ Role-based routing with room selection`);
    console.log(`   ✅ Real-time test functionality`);
    console.log(`   ✅ Enhanced error handling with translations`);
    console.log(`   ✅ Multi-language validation messages`);
});

module.exports = app;