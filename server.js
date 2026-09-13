"use strict";

/* ============================================================
   BMJ SERVICE
   BACKEND COMPLET
   Express + PostgreSQL
============================================================ */

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();

/* ============================================================
   CONFIGURATION
============================================================ */

const PORT =
    process.env.PORT || 10000;

const DATABASE_URL =
    process.env.DATABASE_URL || "postgresql://name_bmj_db_user:TjgoLRbYV0LizRgBFD1nepGqSqErgBgD@dpg-dagn0e15efls73b8rjh0-a/name_bmj_db";

const ADMIN_EMAIL =
    process.env.ADMIN_EMAIL ||
    "admin@bmjservice.com";

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD ||
    "admin123";


/* ============================================================
   POSTGRESQL
============================================================ */

const pool =
    new Pool({
        connectionString: DATABASE_URL,

        ssl: DATABASE_URL
            ? {
                rejectUnauthorized: false
            }
            : false,

        max: 10,

        idleTimeoutMillis:
            30000,

        connectionTimeoutMillis:
            10000
    });


/* ============================================================
   CORS
============================================================ */

app.use(
    cors({
        origin: true,
        methods: [
            "GET",
            "POST",
            "PATCH",
            "PUT",
            "DELETE",
            "OPTIONS"
        ],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "X-Admin-Token",
            "x-admin-token"
        ],
        credentials: false
    })
);


/* ============================================================
   BODY
============================================================ */

app.use(
    express.json({
        limit: "10mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "10mb"
    })
);


/* ============================================================
   LOGGER
============================================================ */

app.use(
    (req, res, next) => {

        console.log(
            `[]  `
        );

        next();
    }
);


/* ============================================================
   OUTILS
============================================================ */

function clean(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    return String(value).trim();
}


function safeNumber(
    value,
    fallback = 0
) {

    const number =
        Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;
}


function clampProgress(value) {

    const number =
        safeNumber(value, 0);

    return Math.min(
        100,
        Math.max(
            0,
            Math.round(number)
        )
    );
}


function booleanValue(value) {

    return (
        value === true ||
        value === "true" ||
        value === 1 ||
        value === "1"
    );
}


function isValidEmail(email) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(email);
}


function hashPassword(password) {

    return crypto
        .createHash("sha256")
        .update(String(password))
        .digest("hex");
}


function createToken() {

    return crypto
        .randomBytes(48)
        .toString("hex");
}


function tokenHash(token) {

    return crypto
        .createHash("sha256")
        .update(String(token))
        .digest("hex");
}


function publicUser(user) {

    if (!user) {
        return null;
    }

    const copy = {
        ...user
    };

    delete copy.password;

    return copy;
}


function normalizeMessagePriority(
    priority
) {

    const allowed = [
        "normal",
        "important",
        "urgent"
    ];

    const value =
        clean(priority)
            .toLowerCase();

    return allowed.includes(value)
        ? value
        : "normal";
}


function normalizeMessageSubject(
    subject
) {

    const value =
        clean(subject);

    if (!value) {
        return "Message BMJ SERVICE";
    }

    return value.substring(0, 200);
}


function normalizeMessageContent(
    message
) {

    return clean(message);
}


/* ============================================================
   TOKEN ADMIN
   UNIQUEMENT EN MÉMOIRE
============================================================ */

const adminTokens =
    new Map();


function getAdminToken(req) {

    const authorization =
        req.headers.authorization || "";

    if (
        authorization &&
        authorization
            .toLowerCase()
            .startsWith("bearer ")
    ) {

        return authorization
            .substring(7)
            .trim();
    }


    const headerToken =
        req.headers["x-admin-token"];

    if (headerToken) {

        return String(
            headerToken
        ).trim();
    }


    const queryToken =
        req.query.token;

    if (queryToken) {

        return String(
            queryToken
        ).trim();
    }


    return null;
}


/* ============================================================
   AUTH ADMIN
============================================================ */

function adminAuth(
    req,
    res,
    next
) {

    const token =
        getAdminToken(req);

    if (!token) {

        return res
            .status(401)
            .json({
                success: false,
                message:
                    "Token administrateur manquant",
                code:
                    "ADMIN_TOKEN_MISSING"
            });
    }


    const saved =
        adminTokens.get(
            tokenHash(token)
        );


    if (!saved) {

        return res
            .status(401)
            .json({
                success: false,
                message:
                    "Token administrateur invalide",
                code:
                    "ADMIN_TOKEN_INVALID"
            });
    }


    req.admin =
        saved;

    req.adminToken =
        token;

    next();
}


/* ============================================================
   JOURNAL ADMIN
============================================================ */

async function logAdminAction(
    action,
    details = ""
) {

    try {

        await pool.query(
            `
            INSERT INTO admin_activity
            (
                action,
                admin_email,
                details
            )
            VALUES
            (, , )
            `,
            [
                action,
                ADMIN_EMAIL,
                details
            ]
        );

    } catch (error) {

        console.error(
            "Erreur journal admin :",
            error.message
        );
    }
}


/* ============================================================
   INITIALISATION BASE
   AUCUNE SUPPRESSION DE DONNÉES
============================================================ */

async function initDatabase() {

    const client =
        await pool.connect();

    try {

        await client.query(
            "BEGIN"
        );


        /* =====================================================
           USERS
        ===================================================== */

        await client.query(
            `
            CREATE TABLE IF NOT EXISTS users
            (
                id SERIAL PRIMARY KEY,

                nom VARCHAR(255),

                email VARCHAR(255)
                    UNIQUE NOT NULL,

                password TEXT NOT NULL,

                is_premium BOOLEAN
                    DEFAULT FALSE,

                is_blocked BOOLEAN
                    DEFAULT FALSE,

                created_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            )
            `
        );


        const userColumns = [

            [
                "telephone",
                "VARCHAR(50)"
            ],

            [
                "domaine",
                "VARCHAR(255)"
            ],

            [
                "photo",
                "TEXT"
            ],

            [
                "progression",
                "INTEGER DEFAULT 0"
            ],

            [
                "certificat_autorise",
                "BOOLEAN DEFAULT FALSE"
            ],

            [
                "certificat_obtenu",
                "BOOLEAN DEFAULT FALSE"
            ],

            [
                "premium_until",
                "TIMESTAMP NULL"
            ],

            [
                "last_login",
                "TIMESTAMP NULL"
            ],

            [
                "updated_at",
                "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
            ],

            [
                "notes_admin",
                "TEXT DEFAULT ''"
            ],

            [
                "sexe",
                "VARCHAR(50)"
            ],

            [
                "pays",
                "VARCHAR(100)"
            ],

            [
                "ville",
                "VARCHAR(150)"
            ],

            [
                "niveau",
                "VARCHAR(100)"
            ]
        ];


        for (
            const [
                column,
                type
            ]
            of userColumns
        ) {

            await client.query(
                `
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS
                 
                `
            );
        }


        /* =====================================================
           DEMANDES PAIEMENT
        ===================================================== */

        await client.query(
            `
            CREATE TABLE IF NOT EXISTS demandes_paiement
            (
                id SERIAL PRIMARY KEY,

                user_id INTEGER
                    REFERENCES users(id)
                    ON DELETE CASCADE,

                telephone_paiement
                    VARCHAR(50),

                montant NUMERIC(10,2)
                    NOT NULL,

                methode VARCHAR(100)
                    NOT NULL,

                statut VARCHAR(50)
                    DEFAULT 'pending',

                reference_paiement
                    VARCHAR(255),

                preuve_paiement
                    TEXT,

                created_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                updated_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            )
            `
        );


        const paymentColumns = [

            [
                "reference_paiement",
                "VARCHAR(255)"
            ],

            [
                "preuve_paiement",
                "TEXT"
            ],

            [
                "updated_at",
                "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
            ],

            [
                "admin_note",
                "TEXT DEFAULT ''"
            ]
        ];


        for (
            const [
                column,
                type
            ]
            of paymentColumns
        ) {

            await client.query(
                `
                ALTER TABLE demandes_paiement
                ADD COLUMN IF NOT EXISTS
                 
                `
            );
        }


        /* =====================================================
           ADMIN ACTIVITY
        ===================================================== */

        await client.query(
            `
            CREATE TABLE IF NOT EXISTS admin_activity
            (
                id SERIAL PRIMARY KEY,

                action VARCHAR(255),

                admin_email VARCHAR(255),

                details TEXT,

                created_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            )
            `
        );


        await client.query(
            `
            ALTER TABLE admin_activity
            ADD COLUMN IF NOT EXISTS
            details TEXT
            `
        );


        /* =====================================================
           MESSAGES
        ===================================================== */

        await client.query(
            `
            CREATE TABLE IF NOT EXISTS messages
            (
                id SERIAL PRIMARY KEY,

                sender_type VARCHAR(30)
                    DEFAULT 'admin',

                sender_id INTEGER NULL,

                recipient_type VARCHAR(30)
                    DEFAULT 'individual',

                recipient_user_id INTEGER NULL
                    REFERENCES users(id)
                    ON DELETE CASCADE,

                audience VARCHAR(30)
                    DEFAULT 'individual',

                subject VARCHAR(255),

                message TEXT NOT NULL,

                priority VARCHAR(30)
                    DEFAULT 'normal',

                is_read BOOLEAN
                    DEFAULT FALSE,

                is_archived BOOLEAN
                    DEFAULT FALSE,

                parent_id INTEGER NULL,

                created_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                updated_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            )
            `
        );


        const messageColumns = [

            [
                "sender_type",
                "VARCHAR(30) DEFAULT 'admin'"
            ],

            [
                "sender_id",
                "INTEGER NULL"
            ],

            [
                "recipient_type",
                "VARCHAR(30) DEFAULT 'individual'"
            ],

            [
                "recipient_user_id",
                "INTEGER NULL"
            ],

            [
                "audience",
                "VARCHAR(30) DEFAULT 'individual'"
            ],

            [
                "subject",
                "VARCHAR(255)"
            ],

            [
                "message",
                "TEXT"
            ],

            [
                "priority",
                "VARCHAR(30) DEFAULT 'normal'"
            ],

            [
                "is_read",
                "BOOLEAN DEFAULT FALSE"
            ],

            [
                "is_archived",
                "BOOLEAN DEFAULT FALSE"
            ],

            [
                "parent_id",
                "INTEGER NULL"
            ],

            [
                "created_at",
                "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
            ],

            [
                "updated_at",
                "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
            ]
        ];


        for (
            const [
                column,
                type
            ]
            of messageColumns
        ) {

            await client.query(
                `
                ALTER TABLE messages
                ADD COLUMN IF NOT EXISTS
                 
                `
            );
        }


        /* =====================================================
           NOTIFICATIONS
        ===================================================== */

        await client.query(
            `
            CREATE TABLE IF NOT EXISTS notifications
            (
                id SERIAL PRIMARY KEY,

                user_id INTEGER
                    REFERENCES users(id)
                    ON DELETE CASCADE,

                title VARCHAR(255),

                message TEXT,

                type VARCHAR(50)
                    DEFAULT 'info',

                is_read BOOLEAN
                    DEFAULT FALSE,

                created_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            )
            `
        );


        /* =====================================================
           CERTIFICATES
        ===================================================== */

        await client.query(
            `
            CREATE TABLE IF NOT EXISTS certificates
            (
                id SERIAL PRIMARY KEY,

                user_id INTEGER
                    REFERENCES users(id)
                    ON DELETE CASCADE,

                domaine VARCHAR(255),

                titre VARCHAR(255),

                certificat_url TEXT,

                certificate_code VARCHAR(255),

                is_authorized BOOLEAN
                    DEFAULT FALSE,

                downloaded BOOLEAN
                    DEFAULT FALSE,

                downloaded_at TIMESTAMP NULL,

                created_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                updated_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            )
            `
        );


        const certificateColumns = [

            [
                "domaine",
                "VARCHAR(255)"
            ],

            [
                "titre",
                "VARCHAR(255)"
            ],

            [
                "certificat_url",
                "TEXT"
            ],

            [
                "certificate_code",
                "VARCHAR(255)"
            ],

            [
                "is_authorized",
                "BOOLEAN DEFAULT FALSE"
            ],

            [
                "downloaded",
                "BOOLEAN DEFAULT FALSE"
            ],

            [
                "downloaded_at",
                "TIMESTAMP NULL"
            ],

            [
                "updated_at",
                "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
            ]
        ];


        for (
            const [
                column,
                type
            ]
            of certificateColumns
        ) {

            await client.query(
                `
                ALTER TABLE certificates
                ADD COLUMN IF NOT EXISTS
                 
                `
            );
        }


        /* =====================================================
           USER PROGRESS
        ===================================================== */

        await client.query(
            `
            CREATE TABLE IF NOT EXISTS user_progress
            (
                id SERIAL PRIMARY KEY,

                user_id INTEGER
                    REFERENCES users(id)
                    ON DELETE CASCADE,

                domaine VARCHAR(255)
                    NOT NULL,

                progression INTEGER
                    DEFAULT 0,

                chapitre_actuel INTEGER,

                chapitre_total INTEGER,

                statut VARCHAR(50)
                    DEFAULT 'en_cours',

                updated_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                UNIQUE(user_id, domaine)
            )
            `
        );


        /* =====================================================
           USER ACTIVITY
        ===================================================== */

        await client.query(
            `
            CREATE TABLE IF NOT EXISTS user_activity
            (
                id SERIAL PRIMARY KEY,

                user_id INTEGER
                    REFERENCES users(id)
                    ON DELETE CASCADE,

                action VARCHAR(255),

                details TEXT,

                created_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            )
            `
        );


        /* =====================================================
           INDEX
        ===================================================== */

        await client.query(
            `
            CREATE INDEX IF NOT EXISTS
            idx_users_email
            ON users(email)
            `
        );


        await client.query(
            `
            CREATE INDEX IF NOT EXISTS
            idx_users_created_at
            ON users(created_at)
            `
        );


        await client.query(
            `
            CREATE INDEX IF NOT EXISTS
            idx_messages_recipient
            ON messages(recipient_user_id)
            `
        );


        await client.query(
            `
            CREATE INDEX IF NOT EXISTS
            idx_messages_created
            ON messages(created_at)
            `
        );


        await client.query(
            `
            CREATE INDEX IF NOT EXISTS
            idx_notifications_user
            ON notifications(user_id)
            `
        );


        await client.query(
            `
            CREATE INDEX IF NOT EXISTS
            idx_progress_user
            ON user_progress(user_id)
            `
        );


        await client.query(
            "COMMIT"
        );


        console.log(
            "=============================================="
        );

        console.log(
            "Base BMJ SERVICE vérifiée."
        );

        console.log(
            "Aucune donnée existante n'a été supprimée."
        );

        console.log(
            "=============================================="
        );


    } catch (error) {

        await client.query(
            "ROLLBACK"
        );

        console.error(
            "Erreur initialisation DB :",
            error
        );

        throw error;

    } finally {

        client.release();
    }
}


/* ============================================================
   ROUTE RACINE
============================================================ */

app.get(
    "/",
    (req, res) => {

        res.json({
            success: true,
            message:
                "BMJ SERVICE API opérationnelle",
            version:
                "30.0.0",
            database:
                "PostgreSQL",
            status:
                "online",
            features: [
                "administration",
                "utilisateurs",
                "paiements",
                "premium",
                "messages",
                "notifications",
                "certificats",
                "progression",
                "activites"
            ]
        });
    }
);


/* ============================================================
   HEALTH
============================================================ */

app.get(
    "/api/health",
    async (req, res) => {

        try {

            await pool.query(
                "SELECT 1"
            );

            res.json({
                success: true,
                status: "ok",
                database: "connected",
                timestamp:
                    new Date().toISOString()
            });

        } catch (error) {

            console.error(
                "Health error:",
                error
            );

            res.status(500).json({
                success: false,
                status: "error",
                database: "disconnected",
                message:
                    "Base de données inaccessible"
            });
        }
    }
);


/* ============================================================
   TEST DB
============================================================ */

app.get(
    "/api/test-db",
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    "SELECT NOW() AS time"
                );

            res.json({
                success: true,
                database: "connected",
                time:
                    result.rows[0].time
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message:
                    "Erreur PostgreSQL",
                error:
                    error.message
            });
        }
    }
);


/* ============================================================
   LISTE DES API
============================================================ */

app.get(
    "/api",
    (req, res) => {

        res.json({
            success: true,

            message:
                "API BMJ SERVICE disponible",

            routes: [

                "GET /",
                "GET /api",
                "GET /api/health",
                "GET /api/test-db",

                "POST /api/admin/login",
                "GET /api/admin/session",
                "DELETE /api/admin/login",

                "GET /api/admin/statistiques",
                "GET /api/admin/statistiques/test",

                "GET /api/admin/users",
                "GET /api/admin/users/:id",

                "PATCH /api/admin/users/:id",
                "PATCH /api/admin/users/:id/password",
                "PATCH /api/admin/users/:id/block",
                "PATCH /api/admin/users/:id/unblock",
                "PATCH /api/admin/users/:id/premium",
                "PATCH /api/admin/users/:id/premium/remove",
                "PATCH /api/admin/users/:id/progression",
                "PATCH /api/admin/users/:id/progression/domaine",
                "PATCH /api/admin/users/:id/certificat",
                "PATCH /api/admin/users/:id/certificat-obtenu",

                "POST /api/admin/certificates",
                "GET /api/admin/users/:id/certificates",

                "GET /api/admin/users/:id/messages",
                "GET /api/admin/users/:id/notifications",
                "GET /api/admin/users/:id/activity",

                "POST /api/admin/messages/user",
                "POST /api/admin/messages/all",
                "POST /api/admin/messages/premium",
                "POST /api/admin/messages/standard",
                "POST /api/admin/messages/:id/reply",

                "GET /api/admin/demandes-paiement",
                "PATCH /api/demandes-paiement/:id/valider",
                "PATCH /api/demandes-paiement/:id/refuser",

                "GET /api/admin/activities",

                "POST /api/inscription",
                "POST /api/register",

                "POST /api/connexion",
                "POST /api/login",

                "GET /api/users/:id",
                "GET /api/users/:id/progression",
                "GET /api/users/:id/messages",
                "PATCH /api/users/:userId/messages/:messageId/read",
                "GET /api/users/:id/certificates",
                "GET /api/users/:id/certificate-access",

                "GET /api/demandes-paiement",
                "POST /api/demandes-paiement"
            ]
        });
    }
);


/* ============================================================
   ADMIN LOGIN
============================================================ */

app.post(
    "/api/admin/login",
    async (req, res) => {

        try {

            const email =
                clean(
                    req.body?.email
                ).toLowerCase();

            const password =
                String(
                    req.body?.password || ""
                );


            if (
                email !==
                ADMIN_EMAIL.toLowerCase() ||
                password !==
                ADMIN_PASSWORD
            ) {

                return res
                    .status(401)
                    .json({
                        success: false,
                        message:
                            "Email ou mot de passe administrateur incorrect"
                    });
            }


            const token =
                createToken();


            adminTokens.set(
                tokenHash(token),
                {
                    email:
                        ADMIN_EMAIL,
                    loginAt:
                        new Date()
                }
            );


            await logAdminAction(
                "CONNEXION_ADMIN",
                "Connexion administrateur réussie"
            );


            res.json({
                success: true,

                token,

                admin: {
                    email:
                        ADMIN_EMAIL
                },

                message:
                    "Connexion administrateur réussie"
            });

        } catch (error) {

            console.error(
                "Erreur login admin:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Erreur serveur"
            });
        }
    }
);


/* ============================================================
   SESSION ADMIN
   PAS DE SESSION PERSISTANTE
============================================================ */

app.get(
    "/api/admin/session",
    adminAuth,
    (req, res) => {

        res.json({
            success: true,

            admin:
                req.admin
        });
    }
);


/* ============================================================
   LOGOUT ADMIN
============================================================ */

app.delete(
    "/api/admin/login",
    adminAuth,
    async (req, res) => {

        try {

            const hash =
                tokenHash(
                    req.adminToken
                );

            adminTokens.delete(
                hash
            );


            await logAdminAction(
                "DECONNEXION_ADMIN",
                "Déconnexion administrateur"
            );


            res.json({
                success: true,
                message:
                    "Déconnexion réussie"
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message:
                    "Erreur déconnexion"
            });
        }
    }
);


/* ============================================================
   STATISTIQUES ADMIN
   VERSION ROBUSTE
============================================================ */

app.get(
    "/api/admin/statistiques",
    adminAuth,
    async (req, res) => {

        console.log(
            "[ADMIN STATS] Début récupération statistiques"
        );


        const stats = {

            users: 0,
            premium: 0,
            standard: 0,
            blocked: 0,
            today: 0,

            payments: 0,
            pending: 0,
            validated: 0,
            refused: 0,
            revenue: 0,

            messages: 0,

            certificates: 0,
            certificates_authorized: 0
        };


        /*
         * Chaque groupe est indépendant.
         * Une erreur secondaire ne doit pas empêcher
         * toutes les autres statistiques d'être envoyées.
         */

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        COUNT(*)::INTEGER AS users,

                        COUNT(*)
                        FILTER (
                            WHERE COALESCE(
                                is_premium,
                                FALSE
                            ) = TRUE
                        )::INTEGER AS premium,

                        COUNT(*)
                        FILTER (
                            WHERE COALESCE(
                                is_premium,
                                FALSE
                            ) = FALSE
                        )::INTEGER AS standard,

                        COUNT(*)
                        FILTER (
                            WHERE COALESCE(
                                is_blocked,
                                FALSE
                            ) = TRUE
                        )::INTEGER AS blocked,

                        COUNT(*)
                        FILTER (
                            WHERE created_at >= CURRENT_DATE
                        )::INTEGER AS today

                    FROM users
                    `
                );


            const row =
                result.rows[0] || {};


            stats.users =
                Number(
                    row.users || 0
                );

            stats.premium =
                Number(
                    row.premium || 0
                );

            stats.standard =
                Number(
                    row.standard || 0
                );

            stats.blocked =
                Number(
                    row.blocked || 0
                );

            stats.today =
                Number(
                    row.today || 0
                );


        } catch (error) {

            console.error(
                "[ADMIN STATS] users:",
                error.message
            );
        }


        /* =====================================================
           PAIEMENTS
        ===================================================== */

        try {

            const result =
                await pool.query(
                    `
                    SELECT

                        COUNT(*)::INTEGER
                            AS total,

                        COUNT(*)
                        FILTER (
                            WHERE LOWER(
                                COALESCE(statut, '')
                            ) = 'pending'
                        )::INTEGER
                            AS pending,

                        COUNT(*)
                        FILTER (
                            WHERE LOWER(
                                COALESCE(statut, '')
                            ) IN (
                                'valide',
                                'valide',
                                'validated',
                                'approved',
                                'paid'
                            )
                        )::INTEGER
                            AS validated,

                        COUNT(*)
                        FILTER (
                            WHERE LOWER(
                                COALESCE(statut, '')
                            ) IN (
                                'refuse',
                                'refused',
                                'rejected'
                            )
                        )::INTEGER
                            AS refused,

                        COALESCE(
                            SUM(
                                COALESCE(
                                    montant,
                                    0
                                )
                            )
                            FILTER (
                                WHERE LOWER(
                                    COALESCE(
                                        statut,
                                        ''
                                    )
                                ) IN (
                                    'valide',
                                    'validated',
                                    'approved',
                                    'paid'
                                )
                            ),
                            0
                        ) AS revenue

                    FROM demandes_paiement
                    `
                );


            const row =
                result.rows[0] || {};


            stats.payments =
                Number(
                    row.total || 0
                );

            stats.pending =
                Number(
                    row.pending || 0
                );

            stats.validated =
                Number(
                    row.validated || 0
                );

            stats.refused =
                Number(
                    row.refused || 0
                );

            stats.revenue =
                Number(
                    row.revenue || 0
                );


        } catch (error) {

            console.error(
                "[ADMIN STATS] payments:",
                error.message
            );
        }


        /* =====================================================
           MESSAGES
        ===================================================== */

        try {

            const result =
                await pool.query(
                    `
                    SELECT COUNT(*)::INTEGER
                    AS total
                    FROM messages
                    `
                );


            stats.messages =
                Number(
                    result.rows[0]?.total || 0
                );


        } catch (error) {

            console.error(
                "[ADMIN STATS] messages:",
                error.message
            );
        }


        /* =====================================================
           CERTIFICATS
        ===================================================== */

        try {

            const result =
                await pool.query(
                    `
                    SELECT

                        COUNT(*)::INTEGER
                            AS total,

                        COUNT(*)
                        FILTER (
                            WHERE COALESCE(
                                is_authorized,
                                FALSE
                            ) = TRUE
                        )::INTEGER
                            AS authorized

                    FROM certificates
                    `
                );


            stats.certificates =
                Number(
                    result.rows[0]?.total || 0
                );

            stats.certificates_authorized =
                Number(
                    result.rows[0]?.authorized || 0
                );


        } catch (error) {

            console.error(
                "[ADMIN STATS] certificates:",
                error.message
            );
        }


        console.log(
            "[ADMIN STATS] Résultat:",
            stats
        );


        return res.json({

            success: true,

            stats,

            message:
                "Statistiques récupérées avec succès",

            generated_at:
                new Date().toISOString()
        });
    }
);


/* ============================================================
   TEST STATISTIQUES
============================================================ */

app.get(
    "/api/admin/statistiques/test",
    adminAuth,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT

                        (
                            SELECT COUNT(*)
                            FROM users
                        ) AS users,

                        (
                            SELECT COUNT(*)
                            FROM demandes_paiement
                        ) AS payments,

                        (
                            SELECT COUNT(*)
                            FROM messages
                        ) AS messages,

                        (
                            SELECT COUNT(*)
                            FROM certificates
                        ) AS certificates
                    `
                );


            res.json({

                success: true,

                database: true,

                test:
                    result.rows[0],

                message:
                    "Connexion statistiques opérationnelle",

                generated_at:
                    new Date().toISOString()
            });


        } catch (error) {

            console.error(
                "[ADMIN STATS TEST]",
                error
            );


            res.status(500).json({

                success: false,

                database: false,

                message:
                    "Test statistiques échoué",

                error:
                    error.message
            });
        }
    }
);


/* ============================================================
   LISTE UTILISATEURS ADMIN
============================================================ */

app.get(
    "/api/admin/users",
    adminAuth,
    async (req, res) => {

        try {

            const search =
                clean(
                    req.query.search
                );


            let result;


            if (search) {

                result =
                    await pool.query(
                        `
                        SELECT
                            id,
                            nom,
                            sexe,
                            email,
                            telephone,
                            domaine,
                            pays,
                            ville,
                            niveau,
                            photo,
                            progression,
                            is_premium,
                            is_blocked,
                            certificat_autorise,
                            certificat_obtenu,
                            premium_until,
                            created_at,
                            updated_at,
                            last_login
                        FROM users
                        WHERE
                            CAST(id AS TEXT)
                                ILIKE $1

                            OR nom ILIKE $1

                            OR email ILIKE $1

                            OR telephone ILIKE $1

                            OR domaine ILIKE $1

                            OR pays ILIKE $1

                            OR ville ILIKE $1

                        ORDER BY id DESC
                        `,
                        [`%${search}%`]
                    );

            } else {

                result =
                    await pool.query(
                        `
                        SELECT
                            id,
                            nom,
                            sexe,
                            email,
                            telephone,
                            domaine,
                            pays,
                            ville,
                            niveau,
                            photo,
                            progression,
                            is_premium,
                            is_blocked,
                            certificat_autorise,
                            certificat_obtenu,
                            premium_until,
                            created_at,
                            updated_at,
                            last_login
                        FROM users
                        ORDER BY id DESC
                        `
                    );
            }


            res.json({

                success: true,

                count:
                    result.rows.length,

                users:
                    result.rows.map(
                        publicUser
                    )
            });


        } catch (error) {

            console.error(
                "Erreur utilisateurs admin:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Erreur récupération utilisateurs",

                error:
                    error.message
            });
        }
    }
);


/* ============================================================
   DETAIL UTILISATEUR
============================================================ */

app.get(
    "/api/admin/users/:id",
    adminAuth,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Identifiant utilisateur invalide"
                });
            }


            const userResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        nom,
                        sexe,
                        email,
                        telephone,
                        domaine,
                        pays,
                        ville,
                        niveau,
                        photo,
                        progression,
                        is_premium,
                        is_blocked,
                        certificat_autorise,
                        certificat_obtenu,
                        premium_until,
                        notes_admin,
                        created_at,
                        updated_at,
                        last_login
                    FROM users
                    WHERE id = $1
                    `,
                    [id]
                );


            if (
                userResult.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Utilisateur introuvable"
                });
            }


            const [
                payments,
                messages,
                progress,
                certificates,
                activities,
                notifications
            ] = await Promise.all([

                pool.query(
                    `
                    SELECT *
                    FROM demandes_paiement
                    WHERE user_id = $1
                    ORDER BY id DESC
                    `,
                    [id]
                ),

                pool.query(
                    `
                    SELECT *
                    FROM messages
                    WHERE
                        recipient_user_id = $1
                        OR (
                            sender_type = 'user'
                            AND sender_id = $1
                        )
                    ORDER BY id ASC
                    `,
                    [id]
                ),

                pool.query(
                    `
                    SELECT *
                    FROM user_progress
                    WHERE user_id = $1
                    ORDER BY domaine ASC
                    `,
                    [id]
                ),

                pool.query(
                    `
                    SELECT *
                    FROM certificates
                    WHERE user_id = $1
                    ORDER BY id DESC
                    `,
                    [id]
                ),

                pool.query(
                    `
                    SELECT *
                    FROM user_activity
                    WHERE user_id = $1
                    ORDER BY id DESC
                    LIMIT 200
                    `,
                    [id]
                ),

                pool.query(
                    `
                    SELECT *
                    FROM notifications
                    WHERE user_id = $1
                    ORDER BY id DESC
                    LIMIT 200
                    `,
                    [id]
                )
            ]);


            res.json({

                success: true,

                user:
                    publicUser(
                        userResult.rows[0]
                    ),

                payments:
                    payments.rows,

                messages:
                    messages.rows,

                progress:
                    progress.rows,

                certificates:
                    certificates.rows,

                activities:
                    activities.rows,

                notifications:
                    notifications.rows
            });


        } catch (error) {

            console.error(
                "Erreur détail utilisateur:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Erreur récupération utilisateur",

                error:
                    error.message
            });
        }
    }
);


/* ============================================================
   MODIFIER UTILISATEUR
============================================================ */

app.patch(
    "/api/admin/users/:id",
    adminAuth,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Identifiant invalide"
                });
            }


            const body =
                req.body || {};


            const fields = {

                nom:
                    clean(body.nom),

                sexe:
                    clean(body.sexe),

                email:
                    clean(body.email)
                        .toLowerCase(),

                telephone:
                    clean(body.telephone),

                domaine:
                    clean(body.domaine),

                pays:
                    clean(body.pays),

                ville:
                    clean(body.ville),

                niveau:
                    clean(body.niveau),

                photo:
                    clean(body.photo),

                notes_admin:
                    clean(body.notes_admin)
            };


            if (
                !fields.email ||
                !isValidEmail(
                    fields.email
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Adresse email invalide"
                });
            }


            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET
                        nom = $1,
                        sexe = $2,
                        email = $3,
                        telephone = $4,
                        domaine = $5,
                        pays = $6,
                        ville = $7,
                        niveau = $8,
                        photo = $9,
                        notes_admin = $10,
                        updated_at =
                            CURRENT_TIMESTAMP
                    WHERE id = $11

                    RETURNING
                        id,
                        nom,
                        sexe,
                        email,
                        telephone,
                        domaine,
                        pays,
                        ville,
                        niveau,
                        photo,
                        progression,
                        is_premium,
                        is_blocked,
                        certificat_autorise,
                        certificat_obtenu,
                        premium_until,
                        notes_admin,
                        created_at,
                        updated_at,
                        last_login
                    `,
                    [
                        fields.nom,
                        fields.sexe,
                        fields.email,
                        fields.telephone,
                        fields.domaine,
                        fields.pays,
                        fields.ville,
                        fields.niveau,
                        fields.photo,
                        fields.notes_admin,
                        id
                    ]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Utilisateur introuvable"
                });
            }


            await logAdminAction(
                "MODIFICATION_UTILISATEUR",
                `Utilisateur ${id} modifié`
            );


            res.json({

                success: true,

                user:
                    result.rows[0],

                message:
                    "Utilisateur modifié avec succès"
            });


        } catch (error) {

            console.error(
                "Erreur modification utilisateur:",
                error
            );


            if (
                error.code === "23505"
            ) {

                return res.status(409).json({
                    success: false,
                    message:
                        "Cette adresse email est déjà utilisée"
                });
            }


            res.status(500).json({

                success: false,

                message:
                    "Erreur modification utilisateur",

                error:
                    error.message
            });
        }
    }
);


/* ============================================================
   MODIFIER MOT DE PASSE
============================================================ */

app.patch(
    "/api/admin/users/:id/password",
    adminAuth,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );

            const password =
                String(
                    req.body?.password || ""
                );


            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Identifiant invalide"
                });
            }


            if (
                password.length < 6
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Le mot de passe doit contenir au moins 6 caractères"
                });
            }


            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET
                        password = $1,
                        updated_at =
                            CURRENT_TIMESTAMP
                    WHERE id = $2
                    RETURNING id
                    `,
                    [
                        hashPassword(
                            password
                        ),
                        id
                    ]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Utilisateur introuvable"
                });
            }


            await logAdminAction(
                "MODIFICATION_MOT_DE_PASSE",
                `Utilisateur ${id}`
            );


            res.json({
                success: true,
                message:
                    "Mot de passe modifié"
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message:
                    "Erreur modification mot de passe"
            });
        }
    }
);


/* ============================================================
   BLOQUER
============================================================ */

app.patch(
    "/api/admin/users/:id/block",
    adminAuth,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET
                        is_blocked = TRUE,
                        updated_at =
                            CURRENT_TIMESTAMP
                    WHERE id = $1

                    RETURNING id
                    `,
                    [id]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Utilisateur introuvable"
                });
            }


            await logAdminAction(
                "BLOCAGE_UTILISATEUR",
                `Utilisateur ${id}`
            );


            res.json({
                success: true,
                message:
                    "Utilisateur bloqué"
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message:
                    "Erreur blocage utilisateur"
            });
        }
    }
);


/* ============================================================
   DÉBLOQUER
============================================================ */

app.patch(
    "/api/admin/users/:id/unblock",
    adminAuth,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET
                        is_blocked = FALSE,
                        updated_at =
                            CURRENT_TIMESTAMP
                    WHERE id = $1

                    RETURNING id
                    `,
                    [id]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Utilisateur introuvable"
                });
            }


            await logAdminAction(
                "DEBLOCAGE_UTILISATEUR",
                `Utilisateur ${id}`
            );


            res.json({
                success: true,
                message:
                    "Utilisateur débloqué"
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message:
                    "Erreur déblocage utilisateur"
            });
        }
    }
);


/* ============================================================
   ACTIVER PREMIUM
============================================================ */

app.patch(
    "/api/admin/users/:id/premium",
    adminAuth,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            let premiumUntil =
                req.body?.premium_until ||
                null;


            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET
                        is_premium = TRUE,
                        premium_until = $1,
                        updated_at =
                            CURRENT_TIMESTAMP
                    WHERE id = $2

                    RETURNING
                        id,
                        is_premium,
                        premium_until
                    `,
                    [
                        premiumUntil,
                        id
                    ]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Utilisateur introuvable"
                });
            }


            await pool.query(
                `
                INSERT INTO notifications
                (
                    user_id,
                    title,
                    message,
                    type
                )
                VALUES
                (
                    $1,
                    'Compte Premium activé',
                    'Votre compte BMJ SERVICE est maintenant Premium.',
                    'premium'
                )
                `,
                [id]
            );


            await logAdminAction(
                "ACTIVATION_PREMIUM",
                `Utilisateur ${id}`
            );


            res.json({

                success: true,

                user:
                    result.rows[0],

                message:
                    "Compte Premium activé"
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message:
                    "Erreur activation Premium"
            });
        }
    }
);


/* ============================================================
   RETIRER PREMIUM
============================================================ */

app.patch(
    "/api/admin/users/:id/premium/remove",
    adminAuth,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET
                        is_premium = FALSE,
                        premium_until = NULL,
                        updated_at =
                            CURRENT_TIMESTAMP
                    WHERE id = $1

                    RETURNING id
                    `,
                    [id]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Utilisateur introuvable"
                });
            }


            await pool.query(
                `
                INSERT INTO notifications
                (
                    user_id,
                    title,
                    message,
                    type
                )
                VALUES
                (
                    $1,
                    'Compte Premium retiré',
                    'Votre compte est redevenu Standard.',
                    'info'
                )
                `,
                [id]
            );


            await logAdminAction(
                "RETRAIT_PREMIUM",
                `Utilisateur ${id}`
            );


            res.json({
                success: true,
                message:
                    "Premium retiré"
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message:
                    "Erreur retrait Premium"
            });
        }
    }
);


/* ============================================================
   PROGRESSION GLOBALE
============================================================ */

app.patch(
    "/api/admin/users/:id/progression",
    adminAuth,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            const progression =
                clampProgress(
                    req.body?.progression
                );


            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET
                        progression = $1,
                        updated_at =
                            CURRENT_TIMESTAMP
                    WHERE id = $2

                    RETURNING
                        id,
                        progression
                    `,
                    [
                        progression,
                        id
                    ]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Utilisateur introuvable"
                });
            }


            await logAdminAction(
                "MODIFICATION_PROGRESSION",
                `Utilisateur ${id} : ${progression}%`
            );


            res.json({

                success: true,

                user:
                    result.rows[0],

                message:
                    "Progression mise à jour"
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message:
                    "Erreur progression"
            });
        }
    }
);


/* ============================================================
   PROGRESSION PAR DOMAINE
============================================================ */

app.patch(
    "/api/admin/users/:id/progression/domaine",
    adminAuth,
    async (req, res) => {

        try {

            const userId =
                Number(
                    req.params.id
                );

            const domaine =
                clean(
                    req.body?.domaine
                );

            const progression =
                clampProgress(
                    req.body?.progression
                );

            const chapitreActuel =
                safeNumber(
                    req.body?.chapitre_actuel,
                    0
                );

            const chapitreTotal =
                safeNumber(
                    req.body?.chapitre_total,
                    0
                );

            const statut =
                progression >= 100
                    ? "termine"
                    : "en_cours";


            if (
                !Number.isInteger(userId) ||
                userId <= 0 ||
                !domaine
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Utilisateur ou domaine invalide"
                });
            }


            const result =
                await pool.query(
                    `
                    INSERT INTO user_progress
                    (
                        user_id,
                        domaine,
                        progression,
                        chapitre_actuel,
                        chapitre_total,
                        statut,
                        updated_at
                    )
                    VALUES
                    (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        CURRENT_TIMESTAMP
                    )

                    ON CONFLICT
                    (
                        user_id,
                        domaine
                    )

                    DO UPDATE SET

                        progression =
                            EXCLUDED.progression,

                        chapitre_actuel =
                            EXCLUDED.chapitre_actuel,

                        chapitre_total =
                            EXCLUDED.chapitre_total,

                        statut =
                            EXCLUDED.statut,

                        updated_at =
                            CURRENT_TIMESTAMP

                    RETURNING *
                    `,
                    [
                        userId,
                        domaine,
                        progression,
                        chapitreActuel,
                        chapitreTotal,
                        statut
                    ]
                );


            res.json({

                success: true,

                progress:
                    result.rows[0],

                message:
                    "Progression du domaine mise à jour"
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message:
                    "Erreur progression domaine"
            });
        }
    }
);


/* ============================================================
   AUTORISER CERTIFICAT
============================================================ */

app.patch(
    "/api/admin/users/:id/certificat",
    adminAuth,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );

            const allowed =
                booleanValue(
                    req.body?.certificat_autorise ??
                    req.body?.allowed
                );


            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET
                        certificat_autorise = $1,
                        updated_at =
                            CURRENT_TIMESTAMP
                    WHERE id = $2

                    RETURNING
                        id,
                        certificat_autorise,
                        certificat_obtenu
                    `,
                    [
                        allowed,
                        id
                    ]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Utilisateur introuvable"
                });
            }


            await logAdminAction(
                "AUTORISATION_CERTIFICAT",
                `Utilisateur ${id}: ${allowed}`
            );


            res.json({

                success: true,

                user:
                    result.rows[0],

                message:
                    allowed
                        ? "Certificat autorisé"
                        : "Autorisation certificat retirée"
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message:
                    "Erreur autorisation certificat"
            });
        }
    }
);


/* ============================================================
   CERTIFICAT OBTENU
============================================================ */

app.patch(
    "/api/admin/users/:id/certificat-obtenu",
    adminAuth,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET
                        certificat_obtenu = TRUE,
                        updated_at =
                            CURRENT_TIMESTAMP
                    WHERE id = $1

                    RETURNING
                        id,
                        certificat_autorise,
                        certificat_obtenu
                    `,
                    [id]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Utilisateur introuvable"
                });
            }


            res.json({

                success: true,

                user:
                    result.rows[0],

                message:
                    "Certificat marqué comme obtenu"
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message:
                    "Erreur certificat"
            });
        }
    }
);


/* ============================================================
   CRÉER CERTIFICAT
============================================================ */

app.post(
    "/api/admin/certificates",
    adminAuth,
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            const userId =
                Number(
                    req.body?.user_id
                );

            const domaine =
                clean(
                    req.body?.domaine
                );

            const titre =
                clean(
                    req.body?.titre
                );

            const certificatUrl =
                clean(
                    req.body?.certificat_url
                );


            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Utilisateur invalide"
                });
            }


            const userResult =
                await client.query(
                    `
                    SELECT id
                    FROM users
                    WHERE id = $1
                    `,
                    [userId]
                );


            if (
                userResult.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Utilisateur introuvable"
                });
            }


            const code =
                "BMJ-CERT-" +
                crypto
                    .randomBytes(8)
                    .toString("hex")
                    .toUpperCase();


            await client.query(
                "BEGIN"
            );


            const certificate =
                await client.query(
                    `
                    INSERT INTO certificates
                    (
                        user_id,
                        domaine,
                        titre,
                        certificat_url,
                        certificate_code,
                        is_authorized,
                        downloaded
                    )
                    VALUES
                    (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        TRUE,
                        FALSE
                    )
                    RETURNING *
                    `,
                    [
                        userId,
                        domaine,
                        titre,
                        certificatUrl,
                        code
                    ]
                );


            await client.query(
                `
                UPDATE users
                SET
                    certificat_autorise = TRUE,
                    certificat_obtenu = TRUE,
                    updated_at =
                        CURRENT_TIMESTAMP
                WHERE id = $1
                `,
                [userId]
            );


            await client.query(
                `
                INSERT INTO notifications
                (
                    user_id,
                    title,
                    message,
                    type
                )
                VALUES
                (
                    $1,
                    'Certificat disponible',
                    'Votre certificat BMJ SERVICE est maintenant disponible.',
                    'certificate'
                )
                `,
                [userId]
            );


            await client.query(
                "COMMIT"
            );


            await logAdminAction(
                "CREATION_CERTIFICAT",
                `Certificat ${code} pour utilisateur ${userId}`
            );


            res.status(201).json({

                success: true,

                certificate:
                    certificate.rows[0],

                message:
                    "Certificat créé avec succès"
            });


        } catch (error) {

            try {
                await client.query(
                    "ROLLBACK"
                );
            } catch (_) {}


            console.error(error);


            res.status(500).json({

                success: false,

                message:
                    "Erreur création certificat",

                error:
                    error.message
            });


        } finally {

            client.release();
        }
    }
);


/* ============================================================
   CERTIFICATS ADMIN UTILISATEUR
============================================================ */

app.get(
    "/api/admin/users/:id/certificates",
    adminAuth,
    async (req, res) => {

        try {

            const userId =
                Number(
                    req.params.id
                );


            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Identifiant utilisateur invalide"
                });
            }


            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM certificates
                    WHERE user_id = $1
                    ORDER BY id DESC
                    `,
                    [userId]
                );


            res.json({

                success: true,

                certificates:
                    result.rows
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Erreur certificats"
            });
        }
    }
);


/* ============================================================
   MESSAGES — UTILITAIRES
============================================================ */

async function createNotification(
    client,
    userId,
    title,
    message,
    type = "info"
) {

    await client.query(
        `
        INSERT INTO notifications
        (
            user_id,
            title,
            message,
            type
        )
        VALUES
        (
            $1,
            $2,
            $3,
            $4
        )
        `,
        [
            userId,
            title,
            message,
            type
        ]
    );
}


/* ============================================================
   MESSAGE UTILISATEUR
============================================================ */

app.post(
    "/api/admin/messages/user",
    adminAuth,
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            const userId =
                Number(
                    req.body?.user_id
                );

            const subject =
                normalizeMessageSubject(
                    req.body?.subject
                );

            const message =
                normalizeMessageContent(
                    req.body?.message
                );

            const priority =
                normalizeMessagePriority(
                    req.body?.priority
                );


            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Utilisateur invalide"
                });
            }


            if (!message) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Le message est requis"
                });
            }


            const userResult =
                await client.query(
                    `
                    SELECT
                        id,
                        nom,
                        email,
                        is_premium,
                        is_blocked
                    FROM users
                    WHERE id = $1
                    `,
                    [userId]
                );


            if (
                userResult.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Utilisateur introuvable"
                });
            }


            if (
                userResult.rows[0]
                    .is_blocked
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Impossible d'envoyer un message à un utilisateur bloqué"
                });
            }


            await client.query(
                "BEGIN"
            );


            const result =
                await client.query(
                    `
                    INSERT INTO messages
                    (
                        sender_type,
                        sender_id,
                        recipient_type,
                        recipient_user_id,
                        audience,
                        subject,
                        message,
                        priority
                    )
                    VALUES
                    (
                        'admin',
                        NULL,
                        'user',
                        $1,
                        'individual',
                        $2,
                        $3,
                        $4
                    )
                    RETURNING *
                    `,
                    [
                        userId,
                        subject,
                        message,
                        priority
                    ]
                );


            await createNotification(
                client,
                userId,
                subject,
                message,
                priority
            );


            await client.query(
                "COMMIT"
            );


            await logAdminAction(
                "MESSAGE_UTILISATEUR",
                `Message envoyé à l'utilisateur ${userId}`
            );


            res.status(201).json({

                success: true,

                messageData:
                    result.rows[0],

                message:
                    "Message envoyé avec succès"
            });


        } catch (error) {

            try {
                await client.query(
                    "ROLLBACK"
                );
            } catch (_) {}


            console.error(
                "Erreur message utilisateur:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Erreur lors de l'envoi du message",

                error:
                    error.message
            });


        } finally {

            client.release();
        }
    }
);


/* ============================================================
   MESSAGE À TOUS
============================================================ */

app.post(
    "/api/admin/messages/all",
    adminAuth,
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            const subject =
                normalizeMessageSubject(
                    req.body?.subject
                );

            const message =
                normalizeMessageContent(
                    req.body?.message
                );

            const priority =
                normalizeMessagePriority(
                    req.body?.priority
                );


            if (!message) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Le message est requis"
                });
            }


            const users =
                await client.query(
                    `
                    SELECT id
                    FROM users
                    WHERE
                        COALESCE(
                            is_blocked,
                            FALSE
                        ) = FALSE
                    ORDER BY id ASC
                    `
                );


            if (
                users.rows.length === 0
            ) {

                return res.json({
                    success: true,
                    count: 0,
                    message:
                        "Aucun utilisateur disponible"
                });
            }


            await client.query(
                "BEGIN"
            );


            let count = 0;


            for (
                const user
                of users.rows
            ) {

                await client.query(
                    `
                    INSERT INTO messages
                    (
                        sender_type,
                        sender_id,
                        recipient_type,
                        recipient_user_id,
                        audience,
                        subject,
                        message,
                        priority
                    )
                    VALUES
                    (
                        'admin',
                        NULL,
                        'user',
                        $1,
                        'all',
                        $2,
                        $3,
                        $4
                    )
                    `,
                    [
                        user.id,
                        subject,
                        message,
                        priority
                    ]
                );


                await createNotification(
                    client,
                    user.id,
                    subject,
                    message,
                    priority
                );


                count++;
            }


            await client.query(
                "COMMIT"
            );


            await logAdminAction(
                "MESSAGE_GLOBAL",
                `${count} utilisateurs`
            );


            res.status(201).json({

                success: true,

                count,

                message:
                    `Message envoyé à ${count} utilisateurs`
            });


        } catch (error) {

            try {
                await client.query(
                    "ROLLBACK"
                );
            } catch (_) {}


            console.error(
                "Erreur message global:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Erreur lors de l'envoi global",

                error:
                    error.message
            });


        } finally {

            client.release();
        }
    }
);


/* ============================================================
   MESSAGE PREMIUM
============================================================ */

app.post(
    "/api/admin/messages/premium",
    adminAuth,
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            const subject =
                normalizeMessageSubject(
                    req.body?.subject ||
                    "Message Premium"
                );

            const message =
                normalizeMessageContent(
                    req.body?.message
                );

            const priority =
                normalizeMessagePriority(
                    req.body?.priority
                );


            if (!message) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Le message est requis"
                });
            }


            const users =
                await client.query(
                    `
                    SELECT id
                    FROM users
                    WHERE
                        COALESCE(
                            is_premium,
                            FALSE
                        ) = TRUE

                        AND COALESCE(
                            is_blocked,
                            FALSE
                        ) = FALSE

                    ORDER BY id ASC
                    `
                );


            if (
                users.rows.length === 0
            ) {

                return res.json({
                    success: true,
                    count: 0,
                    message:
                        "Aucun utilisateur Premium disponible"
                });
            }


            await client.query(
                "BEGIN"
            );


            let count = 0;


            for (
                const user
                of users.rows
            ) {

                await client.query(
                    `
                    INSERT INTO messages
                    (
                        sender_type,
                        sender_id,
                        recipient_type,
                        recipient_user_id,
                        audience,
                        subject,
                        message,
                        priority
                    )
                    VALUES
                    (
                        'admin',
                        NULL,
                        'user',
                        $1,
                        'premium',
                        $2,
                        $3,
                        $4
                    )
                    `,
                    [
                        user.id,
                        subject,
                        message,
                        priority
                    ]
                );


                await createNotification(
                    client,
                    user.id,
                    subject,
                    message,
                    priority
                );


                count++;
            }


            await client.query(
                "COMMIT"
            );


            await logAdminAction(
                "MESSAGE_PREMIUM",
                `${count} utilisateurs Premium`
            );


            res.status(201).json({

                success: true,

                count,

                message:
                    `Message envoyé à ${count} Premium`
            });


        } catch (error) {

            try {
                await client.query(
                    "ROLLBACK"
                );
            } catch (_) {}


            console.error(error);


            res.status(500).json({

                success: false,

                message:
                    "Erreur lors de l'envoi du message Premium",

                error:
                    error.message
            });


        } finally {

            client.release();
        }
    }
);


/* ============================================================
   MESSAGE STANDARD
============================================================ */

app.post(
    "/api/admin/messages/standard",
    adminAuth,
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            const subject =
                normalizeMessageSubject(
                    req.body?.subject
                );

            const message =
                normalizeMessageContent(
                    req.body?.message
                );

            const priority =
                normalizeMessagePriority(
                    req.body?.priority
                );


            if (!message) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Le message est requis"
                });
            }


            const users =
                await client.query(
                    `
                    SELECT id
                    FROM users
                    WHERE
                        COALESCE(
                            is_premium,
                            FALSE
                        ) = FALSE

                        AND COALESCE(
                            is_blocked,
                            FALSE
                        ) = FALSE

                    ORDER BY id ASC
                    `
                );


            if (
                users.rows.length === 0
            ) {

                return res.json({
                    success: true,
                    count: 0,
                    message:
                        "Aucun utilisateur Standard disponible"
                });
            }


            await client.query(
                "BEGIN"
            );


            let count = 0;


            for (
                const user
                of users.rows
            ) {

                await client.query(
                    `
                    INSERT INTO messages
                    (
                        sender_type,
                        sender_id,
                        recipient_type,
                        recipient_user_id,
                        audience,
                        subject,
                        message,
                        priority
                    )
                    VALUES
                    (
                        'admin',
                        NULL,
                        'user',
                        $1,
                        'standard',
                        $2,
                        $3,
                        $4
                    )
                    `,
                    [
                        user.id,
                        subject,
                        message,
                        priority
                    ]
                );


                await createNotification(
                    client,
                    user.id,
                    subject,
                    message,
                    priority
                );


                count++;
            }


            await client.query(
                "COMMIT"
            );


            await logAdminAction(
                "MESSAGE_STANDARD",
                `${count} utilisateurs Standard`
            );


            res.status(201).json({

                success: true,

                count,

                message:
                    `Message envoyé à ${count} Standard`
            });


        } catch (error) {

            try {
                await client.query(
                    "ROLLBACK"
                );
            } catch (_) {}


            console.error(error);


            res.status(500).json({

                success: false,

                message:
                    "Erreur lors de l'envoi du message Standard",

                error:
                    error.message
            });


        } finally {

            client.release();
        }
    }
);


/* ============================================================
   CONVERSATION ADMIN
============================================================ */

app.get(
    "/api/admin/users/:id/messages",
    adminAuth,
    async (req, res) => {

        try {

            const userId =
                Number(
                    req.params.id
                );


            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Identifiant utilisateur invalide"
                });
            }


            const userResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        nom,
                        email,
                        is_premium,
                        is_blocked
                    FROM users
                    WHERE id = $1
                    `,
                    [userId]
                );


            if (
                userResult.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Utilisateur introuvable"
                });
            }


            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM messages
                    WHERE
                        recipient_user_id = $1

                        OR (
                            sender_type = 'user'
                            AND sender_id = $1
                        )

                        OR (
                            parent_id IN (
                                SELECT id
                                FROM messages
                                WHERE
                                    recipient_user_id = $1

                                    OR (
                                        sender_type = 'user'
                                        AND sender_id = $1
                                    )
                            )
                        )

                    ORDER BY id ASC
                    `,
                    [userId]
                );


            res.json({

                success: true,

                user_id:
                    userId,

                user:
                    userResult.rows[0],

                count:
                    result.rows.length,

                messages:
                    result.rows
            });


        } catch (error) {

            console.error(
                "Erreur messages admin:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Erreur lors de la récupération des messages",

                error:
                    error.message
            });
        }
    }
);


/* ============================================================
   RÉPONDRE À UN MESSAGE
============================================================ */

app.post(
    "/api/admin/messages/:id/reply",
    adminAuth,
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            const messageId =
                Number(
                    req.params.id
                );

            const message =
                normalizeMessageContent(
                    req.body?.message
                );


            if (
                !Number.isInteger(messageId) ||
                messageId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Identifiant du message invalide"
                });
            }


            if (!message) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Réponse vide"
                });
            }


            const originalResult =
                await client.query(
                    `
                    SELECT *
                    FROM messages
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [messageId]
                );


            if (
                originalResult.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Message introuvable"
                });
            }


            const original =
                originalResult.rows[0];


            /*
             * Message utilisateur :
             * sender_id = utilisateur
             */

            let userId = null;


            if (
                original.sender_type === "user" &&
                original.sender_id
            ) {

                userId =
                    Number(
                        original.sender_id
                    );
            }


            /*
             * Message admin :
             * recipient_user_id = utilisateur
             */

            if (
                !userId &&
                original.recipient_user_id
            ) {

                userId =
                    Number(
                        original.recipient_user_id
                    );
            }


            /*
             * Si le message est déjà une réponse,
             * on remonte au message parent.
             */

            if (
                !userId &&
                original.parent_id
            ) {

                const parentResult =
                    await client.query(
                        `
                        SELECT
                            sender_id,
                            recipient_user_id
                        FROM messages
                        WHERE id = $1
                        `,
                        [
                            original.parent_id
                        ]
                    );


                const parent =
                    parentResult.rows[0];


                if (parent) {

                    if (
                        parent.sender_id
                    ) {

                        userId =
                            Number(
                                parent.sender_id
                            );
                    }


                    if (
                        !userId &&
                        parent.recipient_user_id
                    ) {

                        userId =
                            Number(
                                parent.recipient_user_id
                            );
                    }
                }
            }


            if (
                !Number.isInteger(userId) ||
                userId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Impossible de déterminer l'utilisateur de cette conversation"
                });
            }


            const userResult =
                await client.query(
                    `
                    SELECT
                        id,
                        nom,
                        email,
                        is_premium,
                        is_blocked
                    FROM users
                    WHERE id = $1
                    `,
                    [userId]
                );


            if (
                userResult.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Utilisateur introuvable"
                });
            }


            if (
                userResult.rows[0]
                    .is_blocked
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Impossible de répondre à un utilisateur bloqué"
                });
            }


            const subject =
                normalizeMessageSubject(
                    original.subject ||
                    "Réponse BMJ SERVICE"
                );


            await client.query(
                "BEGIN"
            );


            const reply =
                await client.query(
                    `
                    INSERT INTO messages
                    (
                        sender_type,
                        sender_id,
                        recipient_type,
                        recipient_user_id,
                        audience,
                        subject,
                        message,
                        priority,
                        parent_id
                    )
                    VALUES
                    (
                        'admin',
                        NULL,
                        'user',
                        $1,
                        'individual',
                        $2,
                        $3,
                        'normal',
                        $4
                    )
                    RETURNING *
                    `,
                    [
                        userId,
                        subject,
                        message,
                        messageId
                    ]
                );


            await createNotification(
                client,
                userId,
                subject,
                message,
                "normal"
            );


            await client.query(
                "COMMIT"
            );


            await logAdminAction(
                "REPONSE_MESSAGE",
                `Réponse ${messageId} envoyée à l'utilisateur ${userId}`
            );


            res.status(201).json({

                success: true,

                messageData:
                    reply.rows[0],

                message:
                    "Réponse envoyée avec succès"
            });


        } catch (error) {

            try {
                await client.query(
                    "ROLLBACK"
                );
            } catch (_) {}


            console.error(
                "Erreur réponse message:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Erreur lors de l'envoi de la réponse",

                error:
                    error.message
            });


        } finally {

            client.release();
        }
    }
);


/* ============================================================
   NOTIFICATIONS ADMIN
============================================================ */

app.get(
    "/api/admin/users/:id/notifications",
    adminAuth,
    async (req, res) => {

        try {

            const userId =
                Number(
                    req.params.id
                );


            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM notifications
                    WHERE user_id = $1
                    ORDER BY id DESC
                    `,
                    [userId]
                );


            res.json({

                success: true,

                notifications:
                    result.rows
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Erreur notifications"
            });
        }
    }
);


/* ============================================================
   DEMANDES PAIEMENT ADMIN
============================================================ */

app.get(
    "/api/admin/demandes-paiement",
    adminAuth,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        d.*,

                        u.nom,
                        u.email,
                        u.telephone,

                        u.is_premium,
                        u.is_blocked

                    FROM demandes_paiement d

                    LEFT JOIN users u
                        ON u.id = d.user_id

                    ORDER BY d.id DESC
                    `
                );


            res.json({

                success: true,

                count:
                    result.rows.length,

                demandes:
                    result.rows
            });


        } catch (error) {

            console.error(
                "Erreur paiements admin:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Erreur récupération paiements",

                error:
                    error.message
            });
        }
    }
);


/* ============================================================
   COMPATIBILITÉ DEMANDES PAIEMENT
============================================================ */

app.get(
    "/api/demandes-paiement",
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM demandes_paiement
                    ORDER BY id DESC
                    `
                );


            res.json({

                success: true,

                demandes:
                    result.rows
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Erreur récupération paiements"
            });
        }
    }
);


/* ============================================================
   CRÉER DEMANDE PAIEMENT
============================================================ */

app.post(
    "/api/demandes-paiement",
    async (req, res) => {

        try {

            const userId =
                Number(
                    req.body?.user_id
                );

            const telephone =
                clean(
                    req.body?.telephone_paiement
                );

            const montant =
                Number(
                    req.body?.montant
                );

            const methode =
                clean(
                    req.body?.methode
                );

            const reference =
                clean(
                    req.body?.reference_paiement
                );

            const preuve =
                clean(
                    req.body?.preuve_paiement
                );


            if (
                !Number.isInteger(userId) ||
                userId <= 0 ||
                !Number.isFinite(montant) ||
                montant <= 0 ||
                !methode
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Informations de paiement incomplètes"
                });
            }


            const user =
                await pool.query(
                    `
                    SELECT id
                    FROM users
                    WHERE id = $1
                    `,
                    [userId]
                );


            if (
                user.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Utilisateur introuvable"
                });
            }


            const result =
                await pool.query(
                    `
                    INSERT INTO demandes_paiement
                    (
                        user_id,
                        telephone_paiement,
                        montant,
                        methode,
                        reference_paiement,
                        preuve_paiement,
                        statut
                    )
                    VALUES
                    (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        'pending'
                    )
                    RETURNING *
                    `,
                    [
                        userId,
                        telephone,
                        montant,
                        methode,
                        reference,
                        preuve
                    ]
                );


            await pool.query(
                `
                INSERT INTO user_activity
                (
                    user_id,
                    action,
                    details
                )
                VALUES
                (
                    $1,
                    $2,
                    $3
                )
                `,
                [
                    userId,
                    "DEMANDE_PAIEMENT",
                    `Demande de ${montant}$ - ${methode}`
                ]
            );


            res.status(201).json({

                success: true,

                demande:
                    result.rows[0],

                message:
                    "Demande de paiement enregistrée"
            });


        } catch (error) {

            console.error(
                "Erreur création paiement:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Erreur création demande paiement",

                error:
                    error.message
            });
        }
    }
);


/* ============================================================
   VALIDER PAIEMENT
============================================================ */

app.patch(
    "/api/demandes-paiement/:id/valider",
    adminAuth,
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            const id =
                Number(
                    req.params.id
                );


            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Identifiant paiement invalide"
                });
            }


            await client.query(
                "BEGIN"
            );


            const payment =
                await client.query(
                    `
                    SELECT
                        id,
                        user_id,
                        montant,
                        statut
                    FROM demandes_paiement
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [id]
                );


            if (
                payment.rows.length === 0
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(404).json({
                    success: false,
                    message:
                        "Demande de paiement introuvable"
                });
            }


            const row =
                payment.rows[0];

            const userId =
                Number(
                    row.user_id
                );


            await client.query(
                `
                UPDATE demandes_paiement
                SET
                    statut = 'valide',
                    updated_at =
                        CURRENT_TIMESTAMP
                WHERE id = $1
                `,
                [id]
            );


            await client.query(
                `
                UPDATE users
                SET
                    is_premium = TRUE,
                    updated_at =
                        CURRENT_TIMESTAMP
                WHERE id = $1
                `,
                [userId]
            );


            await createNotification(
                client,
                userId,
                "Compte Premium activé",
                "Votre paiement a été validé. Votre compte est maintenant Premium.",
                "premium"
            );


            await client.query(
                `
                INSERT INTO user_activity
                (
                    user_id,
                    action,
                    details
                )
                VALUES
                (
                    $1,
                    'PAIEMENT_VALIDE',
                    'Paiement validé par administration'
                )
                `,
                [userId]
            );


            await client.query(
                "COMMIT"
            );


            await logAdminAction(
                "VALIDATION_PAIEMENT",
                `Demande ${id} - utilisateur ${userId}`
            );


            res.json({

                success: true,

                message:
                    "Demande validée et utilisateur passé en Premium"
            });


        } catch (error) {

            try {
                await client.query(
                    "ROLLBACK"
                );
            } catch (_) {}


            console.error(
                "Erreur validation paiement:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Erreur validation paiement",

                error:
                    error.message
            });


        } finally {

            client.release();
        }
    }
);


/* ============================================================
   REFUSER PAIEMENT
============================================================ */

app.patch(
    "/api/demandes-paiement/:id/refuser",
    adminAuth,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );

            const note =
                clean(
                    req.body?.note
                );


            const result =
                await pool.query(
                    `
                    UPDATE demandes_paiement

                    SET
                        statut = 'refuse',
                        admin_note = $1,
                        updated_at =
                            CURRENT_TIMESTAMP

                    WHERE id = $2

                    RETURNING
                        id,
                        user_id,
                        statut,
                        admin_note
                    `,
                    [
                        note,
                        id
                    ]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Demande introuvable"
                });
            }


            await logAdminAction(
                "PAIEMENT_REFUSE",
                `Demande ${id}`
            );


            res.json({

                success: true,

                demande:
                    result.rows[0],

                message:
                    "Paiement refusé"
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Erreur refus paiement",

                error:
                    error.message
            });
        }
    }
);


/* ============================================================
   ACTIVITÉS ADMIN
============================================================ */

app.get(
    "/api/admin/activities",
    adminAuth,
    async (req, res) => {

        try {

            const limit =
                Math.min(
                    500,
                    Math.max(
                        1,
                        safeNumber(
                            req.query.limit,
                            100
                        )
                    )
                );


            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM admin_activity
                    ORDER BY id DESC
                    LIMIT $1
                    `,
                    [limit]
                );


            res.json({

                success: true,

                count:
                    result.rows.length,

                activities:
                    result.rows
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Erreur activités admin"
            });
        }
    }
);


/* ============================================================
   ACTIVITÉS UTILISATEUR
============================================================ */

app.get(
    "/api/admin/users/:id/activity",
    adminAuth,
    async (req, res) => {

        try {

            const userId =
                Number(
                    req.params.id
                );


            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM user_activity
                    WHERE user_id = $1
                    ORDER BY id DESC
                    LIMIT 200
                    `,
                    [userId]
                );


            res.json({

                success: true,

                activities:
                    result.rows
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Erreur activité utilisateur"
            });
        }
    }
);


/* ============================================================
   SUPPRESSION UTILISATEUR
   ACTION ADMIN EXPLICITE UNIQUEMENT
============================================================ */

app.delete(
    "/api/admin/users/:id",
    adminAuth,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            const result =
                await pool.query(
                    `
                    DELETE FROM users
                    WHERE id = $1

                    RETURNING
                        id,
                        email
                    `,
                    [id]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Utilisateur introuvable"
                });
            }


            await logAdminAction(
                "SUPPRESSION_UTILISATEUR",
                `Utilisateur ID ${id}`
            );


            res.json({

                success: true,

                message:
                    "Utilisateur supprimé définitivement"
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Erreur suppression utilisateur",

                error:
                    error.message
            });
        }
    }
);


/* ============================================================
   INSCRIPTION
============================================================ */

async function registerUser(
    req,
    res
) {

    try {

        const nom =
            clean(
                req.body?.nom
            );

        const sexe =
            clean(
                req.body?.sexe
            );

        const email =
            clean(
                req.body?.email
            ).toLowerCase();

        const telephone =
            clean(
                req.body?.telephone
            );

        const domaine =
            clean(
                req.body?.domaine
            );

        const pays =
            clean(
                req.body?.pays
            );

        const ville =
            clean(
                req.body?.ville
            );

        const niveau =
            clean(
                req.body?.niveau
            );

        const password =
            String(
                req.body?.password || ""
            );

        const photo =
            clean(
                req.body?.photo
            );


        if (!nom) {

            return res.status(400).json({
                success: false,
                message:
                    "Le nom est requis"
            });
        }


        if (!email) {

            return res.status(400).json({
                success: false,
                message:
                    "L'adresse email est requise"
            });
        }


        if (!isValidEmail(email)) {

            return res.status(400).json({
                success: false,
                message:
                    "Adresse email invalide"
            });
        }


        if (!password) {

            return res.status(400).json({
                success: false,
                message:
                    "Le mot de passe est requis"
            });
        }


        if (
            password.length < 6
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Le mot de passe doit contenir au moins 6 caractères"
            });
        }


        const existing =
            await pool.query(
                `
                SELECT id
                FROM users
                WHERE LOWER(email) = $1
                LIMIT 1
                `,
                [email]
            );


        if (
            existing.rows.length > 0
        ) {

            return res.status(409).json({
                success: false,
                message:
                    "Cette adresse email est déjà utilisée"
            });
        }


        const result =
            await pool.query(
                `
                INSERT INTO users
                (
                    nom,
                    sexe,
                    email,
                    telephone,
                    domaine,
                    pays,
                    ville,
                    niveau,
                    password,
                    photo,
                    progression,
                    is_premium,
                    is_blocked,
                    certificat_autorise,
                    certificat_obtenu,
                    created_at,
                    updated_at
                )
                VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    $9,
                    $10,
                    0,
                    FALSE,
                    FALSE,
                    FALSE,
                    FALSE,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                )
                RETURNING
                    id,
                    nom,
                    sexe,
                    email,
                    telephone,
                    domaine,
                    pays,
                    ville,
                    niveau,
                    photo,
                    progression,
                    is_premium,
                    is_blocked,
                    certificat_autorise,
                    certificat_obtenu,
                    premium_until,
                    created_at,
                    updated_at,
                    last_login
                `,
                [
                    nom,
                    sexe,
                    email,
                    telephone,
                    domaine,
                    pays,
                    ville,
                    niveau,
                    hashPassword(
                        password
                    ),
                    photo
                ]
            );


        const user =
            result.rows[0];


        await pool.query(
            `
            INSERT INTO user_activity
            (
                user_id,
                action,
                details
            )
            VALUES
            (
                $1,
                'INSCRIPTION',
                'Création du compte depuis la page d'inscription'
            )
            `,
            [user.id]
        );


        res.status(201).json({

            success: true,

            message:
                "Inscription réussie",

            user
        });


    } catch (error) {

        console.error(
            "Erreur inscription:",
            error
        );


        if (
            error.code === "23505"
        ) {

            return res.status(409).json({
                success: false,
                message:
                    "Cette adresse email est déjà utilisée"
            });
        }


        res.status(500).json({

            success: false,

            message:
                "Erreur lors de l'inscription",

            error:
                error.message
        });
    }
}


app.post(
    "/api/inscription",
    registerUser
);


app.post(
    "/api/register",
    registerUser
);


/* ============================================================
   CONNEXION UTILISATEUR
============================================================ */

async function loginUser(
    req,
    res
) {

    try {

        const email =
            clean(
                req.body?.email
            ).toLowerCase();

        const password =
            String(
                req.body?.password || ""
            );


        if (!email) {

            return res.status(400).json({
                success: false,
                message:
                    "L'adresse email est requise"
            });
        }


        if (
            !isValidEmail(email)
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Adresse email invalide"
            });
        }


        if (!password) {

            return res.status(400).json({
                success: false,
                message:
                    "Le mot de passe est requis"
            });
        }


        const result =
            await pool.query(
                `
                SELECT
                    id,
                    nom,
                    sexe,
                    email,
                    telephone,
                    domaine,
                    pays,
                    ville,
                    niveau,
                    photo,
                    password,
                    progression,
                    is_premium,
                    is_blocked,
                    certificat_autorise,
                    certificat_obtenu,
                    premium_until,
                    created_at,
                    updated_at,
                    last_login
                FROM users
                WHERE LOWER(email) = $1
                LIMIT 1
                `,
                [email]
            );


        if (
            result.rows.length === 0
        ) {

            return res.status(401).json({
                success: false,
                message:
                    "Email ou mot de passe incorrect"
            });
        }


        const user =
            result.rows[0];


        if (
            user.password !==
            hashPassword(
                password
            )
        ) {

            return res.status(401).json({
                success: false,
                message:
                    "Email ou mot de passe incorrect"
            });
        }


        if (
            user.is_blocked === true
        ) {

            return res.status(403).json({
                success: false,
                message:
                    "Ce compte a été bloqué par l'administration"
            });
        }


        await pool.query(
            `
            UPDATE users
            SET
                last_login =
                    CURRENT_TIMESTAMP,

                updated_at =
                    CURRENT_TIMESTAMP

            WHERE id = $1
            `,
            [user.id]
        );


        await pool.query(
            `
            INSERT INTO user_activity
            (
                user_id,
                action,
                details
            )
            VALUES
            (
                $1,
                'CONNEXION',
                'Connexion utilisateur'
            )
            `,
            [user.id]
        );


        delete user.password;


        res.json({

            success: true,

            message:
                "Connexion réussie",

            user
        });


    } catch (error) {

        console.error(
            "Erreur connexion:",
            error
        );


        res.status(500).json({

            success: false,

            message:
                "Erreur serveur",

            error:
                error.message
        });
    }
}


app.post(
    "/api/connexion",
    loginUser
);


app.post(
    "/api/login",
    loginUser
);


/* ============================================================
   PROFIL UTILISATEUR
============================================================ */

app.get(
    "/api/users/:id",
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        nom,
                        sexe,
                        email,
                        telephone,
                        domaine,
                        pays,
                        ville,
                        niveau,
                        photo,
                        progression,
                        is_premium,
                        is_blocked,
                        certificat_autorise,
                        certificat_obtenu,
                        premium_until,
                        created_at,
                        updated_at,
                        last_login
                    FROM users
                    WHERE id = $1
                    `,
                    [id]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Utilisateur introuvable"
                });
            }


            res.json({

                success: true,

                user:
                    result.rows[0]
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message:
                    "Erreur serveur"
            });
        }
    }
);


/* ============================================================
   PROGRESSION UTILISATEUR
============================================================ */

app.get(
    "/api/users/:id/progression",
    async (req, res) => {

        try {

            const userId =
                Number(
                    req.params.id
                );


            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM user_progress
                    WHERE user_id = $1
                    ORDER BY domaine ASC
                    `,
                    [userId]
                );


            res.json({

                success: true,

                progress:
                    result.rows
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Erreur progression"
            });
        }
    }
);


/* ============================================================
   MESSAGES UTILISATEUR
============================================================ */

app.get(
    "/api/users/:id/messages",
    async (req, res) => {

        try {

            const userId =
                Number(
                    req.params.id
                );


            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        sender_type,
                        audience,
                        subject,
                        message,
                        priority,
                        is_read,
                        parent_id,
                        created_at
                    FROM messages
                    WHERE recipient_user_id = $1
                    ORDER BY id DESC
                    `,
                    [userId]
                );


            res.json({

                success: true,

                messages:
                    result.rows
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Erreur messages"
            });
        }
    }
);


/* ============================================================
   MARQUER MESSAGE LU
============================================================ */

app.patch(
    "/api/users/:userId/messages/:messageId/read",
    async (req, res) => {

        try {

            const userId =
                Number(
                    req.params.userId
                );

            const messageId =
                Number(
                    req.params.messageId
                );


            const result =
                await pool.query(
                    `
                    UPDATE messages
                    SET
                        is_read = TRUE,
                        updated_at =
                            CURRENT_TIMESTAMP

                    WHERE
                        id = $1
                        AND recipient_user_id = $2

                    RETURNING id
                    `,
                    [
                        messageId,
                        userId
                    ]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Message introuvable"
                });
            }


            res.json({

                success: true,

                message:
                    "Message marqué comme lu"
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Erreur message"
            });
        }
    }
);


/* ============================================================
   CERTIFICATS UTILISATEUR
============================================================ */

app.get(
    "/api/users/:id/certificates",
    async (req, res) => {

        try {

            const userId =
                Number(
                    req.params.id
                );


            const userResult =
                await pool.query(
                    `
                    SELECT
                        certificat_autorise,
                        certificat_obtenu,
                        progression
                    FROM users
                    WHERE id = $1
                    `,
                    [userId]
                );


            if (
                userResult.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Utilisateur introuvable"
                });
            }


            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM certificates
                    WHERE user_id = $1
                    ORDER BY id DESC
                    `,
                    [userId]
                );


            const user =
                userResult.rows[0];


            res.json({

                success: true,

                authorization: {

                    allowed:
                        Boolean(
                            user.certificat_autorise
                        ),

                    obtained:
                        Boolean(
                            user.certificat_obtenu
                        ),

                    progression:
                        user.progression
                },

                certificates:
                    result.rows
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Erreur certificats"
            });
        }
    }
);


/* ============================================================
   ACCÈS CERTIFICAT
============================================================ */

app.get(
    "/api/users/:id/certificate-access",
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        progression,
                        is_premium,
                        certificat_autorise,
                        certificat_obtenu
                    FROM users
                    WHERE id = $1
                    `,
                    [id]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Utilisateur introuvable"
                });
            }


            const user =
                result.rows[0];


            res.json({

                success: true,

                allowed:
                    Boolean(
                        user.certificat_autorise
                    ),

                obtained:
                    Boolean(
                        user.certificat_obtenu
                    ),

                progression:
                    user.progression,

                is_premium:
                    Boolean(
                        user.is_premium
                    )
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Erreur vérification certificat"
            });
        }
    }
);


/* ============================================================
   404 API
============================================================ */

app.use(
    "/api",
    (req, res) => {

        res.status(404).json({

            success: false,

            message:
                "Route API introuvable",

            method:
                req.method,

            path:
                req.originalUrl
        });
    }
);


/* ============================================================
   ERREUR GLOBALE
============================================================ */

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            "Erreur globale:",
            error
        );


        if (
            res.headersSent
        ) {

            return next(error);
        }


        res.status(500).json({

            success: false,

            message:
                "Erreur interne du serveur",

            error:
                error.message
        });
    }
);


/* ============================================================
   ARRÊT PROPRE
============================================================ */

async function gracefulShutdown(
    signal
) {

    console.log(
        `${signal} reçu. Arrêt du serveur...`
    );


    try {

        await pool.end();

        console.log(
            "Connexion PostgreSQL fermée."
        );

        process.exit(0);


    } catch (error) {

        console.error(
            "Erreur arrêt serveur:",
            error
        );

        process.exit(1);
    }
}


process.on(
    "SIGTERM",
    () =>
        gracefulShutdown(
            "SIGTERM"
        )
);


process.on(
    "SIGINT",
    () =>
        gracefulShutdown(
            "SIGINT"
        )
);


/* ============================================================
   DÉMARRAGE
============================================================ */

async function startServer() {

    await initDatabase();


    app.listen(
        PORT,
        () => {

            console.log(
                "=================================================="
            );

            console.log(
                " BMJ SERVICE BACKEND"
            );

            console.log(
                " Serveur démarré avec succès"
            );

            console.log(
                ` Port : ${PORT}`
            );

            console.log(
                " PostgreSQL : activé"
            );

            console.log(
                " Administration : activée"
            );

            console.log(
                " Statistiques : activées"
            );

            console.log(
                " Utilisateurs : activés"
            );

            console.log(
                " Inscription : activée"
            );

            console.log(
                " Connexion utilisateur : activée"
            );

            console.log(
                " Premium : activé"
            );

            console.log(
                " Progression : activée"
            );

            console.log(
                " Certificats : activés"
            );

            console.log(
                " Messages : activés"
            );

            console.log(
                " Notifications : activées"
            );

            console.log(
                " Paiements : activés"
            );

            console.log(
                "=================================================="
            );
        }
    );
}


startServer()
    .catch(
        error => {

            console.error(
                "Impossible de démarrer le serveur:",
                error
            );

            process.exit(1);
        }
    );