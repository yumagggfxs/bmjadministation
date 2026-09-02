/* ============================================================
   BMJ SERVICE
   BACKEND API COMPLET
   NODE.JS + EXPRESS + POSTGRESQL
   DESTINATION : RENDER

   VERSION : 13.0.0

   ============================================================
   FONCTIONNALITÉS
   ------------------------------------------------------------
   - PostgreSQL
   - CORS
   - Inscription utilisateur
   - Connexion utilisateur
   - Authentification administrateur
   - Dashboard administrateur
   - Gestion utilisateurs
   - Modification utilisateurs
   - Suppression utilisateurs
   - Blocage / déblocage
   - Activation / désactivation Premium
   - Système de paiements existant
   - NOUVEAU système séparé de demandes de paiement
   - Validation demande de paiement
   - Refus demande de paiement
   - Activation automatique Premium
   - Statistiques
   - Journal administrateur
   - Health check
   - Graceful shutdown

   IMPORTANT
   ------------------------------------------------------------
   La nouvelle page de demande de paiement utilise :

       POST /api/demandes-paiement

   Elle n'utilise PAS :

       POST /api/paiements

   Données de la nouvelle demande :

       user_id
       telephone_paiement
       reference_paiement

============================================================ */


/* ============================================================
   1. IMPORTATIONS
============================================================ */

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const crypto = require("crypto");


/* ============================================================
   2. APPLICATION
============================================================ */

const app = express();

const PORT =
    process.env.PORT || 10000;


/* ============================================================
   3. CONFIGURATION POSTGRESQL
============================================================ */

const DATABASE_URL =
    process.env.DATABASE_URL ||
    "postgresql://bmj_db_user:5FSX8YeJNzwinKdFOrIeEC43aQsuzf91@dpg-d9sdlt49v7es73emrq8g-a/bmj_db";


const pool =
    new Pool({

        connectionString:
            DATABASE_URL,

        ssl: {
            rejectUnauthorized: false
        },

        max: 10,

        idleTimeoutMillis:
            30000,

        connectionTimeoutMillis:
            10000

    });


/* ============================================================
   4. ADMINISTRATEUR
============================================================ */

const ADMIN_EMAIL =
    process.env.ADMIN_EMAIL ||
    "admin@bmjservice.com";


const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD ||
    "BMJAdmin@2026";


const ADMIN_SECRET =
    process.env.ADMIN_SECRET ||
    "BMJ_SERVICE_ADMIN_SECRET_2026_CHANGE_ME_9X7K2P";


/* ============================================================
   5. MIDDLEWARE CORS
============================================================ */

app.use(

    cors({

        origin: true,

        methods: [
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "OPTIONS"
        ],

        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "Accept"
        ],

        credentials: false

    })

);


/* ============================================================
   6. BODY PARSER
============================================================ */

app.use(

    express.json({

        limit: "20mb"

    })

);


app.use(

    express.urlencoded({

        extended: true,

        limit: "20mb"

    })

);


/* ============================================================
   7. LOG DES REQUÊTES
============================================================ */

app.use(

    function(req, res, next) {

        console.log(

            `[${new Date().toISOString()}] ` +
            `${req.method} ${req.originalUrl}`

        );

        next();

    }

);


/* ============================================================
   8. RÉPONSES STANDARD
============================================================ */

function success(

    res,

    data = null,

    message = "Opération réussie"

) {

    return res.json({

        success: true,

        message,

        data

    });

}


function error(

    res,

    message = "Une erreur est survenue",

    status = 500,

    details = null

) {

    console.error(

        `[BMJ ERROR] ${message}`,

        details || ""

    );

    return res.status(status).json({

        success: false,

        message,

        error: message,

        details

    });

}


/* ============================================================
   9. OUTILS
============================================================ */

function parseId(value) {

    const id =
        Number(value);


    if (

        !Number.isInteger(id) ||

        id <= 0

    ) {

        return null;

    }


    return id;

}


function normalizeEmail(email) {

    return String(email || "")

        .trim()

        .toLowerCase();

}


function getBoolean(

    value,

    defaultValue = false

) {

    if (

        value === undefined ||

        value === null

    ) {

        return defaultValue;

    }


    if (

        typeof value === "boolean"

    ) {

        return value;

    }


    return (

        String(value)

            .trim()

            .toLowerCase() === "true"

    );

}


/* ============================================================
   10. TOKEN ADMIN
============================================================ */

function generateToken() {

    const timestamp =
        Date.now().toString();


    const random =
        crypto

            .randomBytes(32)

            .toString("hex");


    const payload =
        timestamp +
        "." +
        random;


    const signature =
        crypto

            .createHmac(

                "sha256",

                ADMIN_SECRET

            )

            .update(payload)

            .digest("hex");


    return Buffer

        .from(

            payload +
            "." +
            signature

        )

        .toString("base64url");

}


function verifyToken(token) {

    try {

        if (!token) {

            return false;

        }


        const decoded =
            Buffer

                .from(

                    token,

                    "base64url"

                )

                .toString("utf8");


        const parts =
            decoded.split(".");


        if (

            parts.length !== 3

        ) {

            return false;

        }


        const timestamp =
            parts[0];


        const random =
            parts[1];


        const signature =
            parts[2];


        const payload =
            timestamp +
            "." +
            random;


        const expected =
            crypto

                .createHmac(

                    "sha256",

                    ADMIN_SECRET

                )

                .update(payload)

                .digest("hex");


        if (

            signature.length !==
            expected.length

        ) {

            return false;

        }


        const validSignature =
            crypto.timingSafeEqual(

                Buffer.from(signature),

                Buffer.from(expected)

            );


        if (!validSignature) {

            return false;

        }


        const tokenTime =
            Number(timestamp);


        if (

            !Number.isFinite(
                tokenTime
            )

        ) {

            return false;

        }


        const maxAge =
            24 *
            60 *
            60 *
            1000;


        if (

            Date.now() -
            tokenTime >
            maxAge

        ) {

            return false;

        }


        return true;

    } catch (err) {

        return false;

    }

}


/* ============================================================
   11. AUTHENTIFICATION ADMIN
============================================================ */

function adminAuth(req, res, next) {

    const authorization =
        req.headers.authorization || "";


    let token = "";


    if (

        authorization.startsWith(
            "Bearer "
        )

    ) {

        token =
            authorization

                .substring(7)

                .trim();

    }


    if (

        !token &&
        req.query.token

    ) {

        token =
            String(
                req.query.token
            );

    }


    if (

        !verifyToken(token)

    ) {

        return error(

            res,

            "Accès administrateur non autorisé.",

            401

        );

    }


    req.admin = {

        email:
            ADMIN_EMAIL,

        role:
            "administrator"

    };


    next();

}


/* ============================================================
   12. JOURNAL ADMIN
============================================================ */

async function logActivity(

    action,

    description,

    userId = null,

    paymentId = null

) {

    try {

        await pool.query(

            `
            INSERT INTO admin_activity
            (
                action,
                description,
                user_id,
                payment_id,
                admin_email
            )
            VALUES
            ($1,$2,$3,$4,$5)
            `,

            [

                action,

                description,

                userId,

                paymentId,

                ADMIN_EMAIL

            ]

        );

    } catch (err) {

        console.error(

            "Erreur journal admin :",

            err.message

        );

    }

}


/* ============================================================
   13. INITIALISATION BASE DE DONNÉES
============================================================ */

async function initDatabase() {

    const client =
        await pool.connect();


    try {

        console.log(
            "Connexion à PostgreSQL..."
        );


        /* ====================================================
           USERS
        ==================================================== */

        await client.query(`

            CREATE TABLE IF NOT EXISTS users (

                id SERIAL PRIMARY KEY,

                nom VARCHAR(255),

                email VARCHAR(255) UNIQUE,

                telephone VARCHAR(100),

                domaine VARCHAR(255),

                password TEXT,

                photo TEXT,

                premium BOOLEAN DEFAULT FALSE,

                is_premium BOOLEAN DEFAULT FALSE,

                premium_until TIMESTAMP NULL,

                blocked BOOLEAN DEFAULT FALSE,

                is_blocked BOOLEAN DEFAULT FALSE,

                created_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                updated_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP

            );

        `);


        /* ====================================================
           PAIEMENTS EXISTANTS
        ==================================================== */

        await client.query(`

            CREATE TABLE IF NOT EXISTS paiements (

                id SERIAL PRIMARY KEY,

                user_id INTEGER NULL,

                nom VARCHAR(255),

                email VARCHAR(255),

                telephone VARCHAR(100),

                amount NUMERIC(15,2)
                    DEFAULT 0,

                montant NUMERIC(15,2)
                    DEFAULT 0,

                currency VARCHAR(20)
                    DEFAULT 'USD',

                methode VARCHAR(100),

                method VARCHAR(100),

                reference VARCHAR(255),

                transaction_id VARCHAR(255),

                preuve TEXT,

                proof TEXT,

                status VARCHAR(50)
                    DEFAULT 'pending',

                premium_days INTEGER
                    DEFAULT 30,

                notes TEXT,

                refusal_reason TEXT,

                created_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                validated_at TIMESTAMP NULL,

                refused_at TIMESTAMP NULL,

                updated_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP

            );

        `);


        /* ====================================================
           ADMIN ACTIVITY
        ==================================================== */

        await client.query(`

            CREATE TABLE IF NOT EXISTS admin_activity (

                id SERIAL PRIMARY KEY,

                action VARCHAR(255),

                description TEXT,

                user_id INTEGER NULL,

                payment_id INTEGER NULL,

                admin_email VARCHAR(255),

                created_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP

            );

        `);


        /* ====================================================
           NOUVELLE TABLE :
           DEMANDES DE PAIEMENT
        ==================================================== */

        await client.query(`

            CREATE TABLE IF NOT EXISTS demandes_paiement (

                id SERIAL PRIMARY KEY,

                user_id INTEGER NOT NULL,

                telephone_paiement VARCHAR(100) NOT NULL,

                reference_paiement VARCHAR(255) NOT NULL,

                status VARCHAR(50)
                    DEFAULT 'pending',

                refusal_reason TEXT,

                created_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                validated_at TIMESTAMP NULL,

                refused_at TIMESTAMP NULL,

                updated_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP

            );

        `);


        /* ====================================================
           MIGRATIONS USERS
        ==================================================== */

        await client.query(`

            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS nom
            VARCHAR(255);

        `);


        await client.query(`

            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS email
            VARCHAR(255);

        `);


        await client.query(`

            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS telephone
            VARCHAR(100);

        `);


        await client.query(`

            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS domaine
            VARCHAR(255);

        `);


        await client.query(`

            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS password
            TEXT;

        `);


        await client.query(`

            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS photo
            TEXT;

        `);


        await client.query(`

            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS premium
            BOOLEAN DEFAULT FALSE;

        `);


        await client.query(`

            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS is_premium
            BOOLEAN DEFAULT FALSE;

        `);


        await client.query(`

            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS premium_until
            TIMESTAMP NULL;

        `);


        await client.query(`

            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS blocked
            BOOLEAN DEFAULT FALSE;

        `);


        await client.query(`

            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS is_blocked
            BOOLEAN DEFAULT FALSE;

        `);


        await client.query(`

            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS created_at
            TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

        `);


        await client.query(`

            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS updated_at
            TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

        `);


        /* ====================================================
           MIGRATIONS PAIEMENTS
        ==================================================== */

        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS user_id
            INTEGER NULL;

        `);


        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS nom
            VARCHAR(255);

        `);


        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS email
            VARCHAR(255);

        `);


        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS telephone
            VARCHAR(100);

        `);


        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS amount
            NUMERIC(15,2)
            DEFAULT 0;

        `);


        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS montant
            NUMERIC(15,2)
            DEFAULT 0;

        `);


        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS currency
            VARCHAR(20)
            DEFAULT 'USD';

        `);


        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS methode
            VARCHAR(100);

        `);


        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS method
            VARCHAR(100);

        `);


        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS reference
            VARCHAR(255);

        `);


        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS transaction_id
            VARCHAR(255);

        `);


        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS preuve
            TEXT;

        `);


        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS proof
            TEXT;

        `);


        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS status
            VARCHAR(50)
            DEFAULT 'pending';

        `);


        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS premium_days
            INTEGER
            DEFAULT 30;

        `);


        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS notes
            TEXT;

        `);


        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS refusal_reason
            TEXT;

        `);


        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS created_at
            TIMESTAMP
            DEFAULT CURRENT_TIMESTAMP;

        `);


        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS validated_at
            TIMESTAMP NULL;

        `);


        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS refused_at
            TIMESTAMP NULL;

        `);


        await client.query(`

            ALTER TABLE paiements
            ADD COLUMN IF NOT EXISTS updated_at
            TIMESTAMP
            DEFAULT CURRENT_TIMESTAMP;

        `);


        /* ====================================================
           MIGRATIONS DEMANDES PAIEMENT
        ==================================================== */

        await client.query(`

            ALTER TABLE demandes_paiement
            ADD COLUMN IF NOT EXISTS user_id
            INTEGER;

        `);


        await client.query(`

            ALTER TABLE demandes_paiement
            ADD COLUMN IF NOT EXISTS telephone_paiement
            VARCHAR(100);

        `);


        await client.query(`

            ALTER TABLE demandes_paiement
            ADD COLUMN IF NOT EXISTS reference_paiement
            VARCHAR(255);

        `);


        await client.query(`

            ALTER TABLE demandes_paiement
            ADD COLUMN IF NOT EXISTS status
            VARCHAR(50)
            DEFAULT 'pending';

        `);


        await client.query(`

            ALTER TABLE demandes_paiement
            ADD COLUMN IF NOT EXISTS refusal_reason
            TEXT;

        `);


        await client.query(`

            ALTER TABLE demandes_paiement
            ADD COLUMN IF NOT EXISTS created_at
            TIMESTAMP
            DEFAULT CURRENT_TIMESTAMP;

        `);


        await client.query(`

            ALTER TABLE demandes_paiement
            ADD COLUMN IF NOT EXISTS validated_at
            TIMESTAMP NULL;

        `);


        await client.query(`

            ALTER TABLE demandes_paiement
            ADD COLUMN IF NOT EXISTS refused_at
            TIMESTAMP NULL;

        `);


        await client.query(`

            ALTER TABLE demandes_paiement
            ADD COLUMN IF NOT EXISTS updated_at
            TIMESTAMP
            DEFAULT CURRENT_TIMESTAMP;

        `);


        /* ====================================================
           INDEX USERS
        ==================================================== */

        await client.query(`

            CREATE INDEX IF NOT EXISTS
            idx_users_email
            ON users(email);

        `);


        await client.query(`

            CREATE INDEX IF NOT EXISTS
            idx_users_premium
            ON users(premium);

        `);


        await client.query(`

            CREATE INDEX IF NOT EXISTS
            idx_users_blocked
            ON users(blocked);

        `);


        /* ====================================================
           INDEX PAIEMENTS
        ==================================================== */

        await client.query(`

            CREATE INDEX IF NOT EXISTS
            idx_paiements_status
            ON paiements(status);

        `);


        await client.query(`

            CREATE INDEX IF NOT EXISTS
            idx_paiements_user
            ON paiements(user_id);

        `);


        await client.query(`

            CREATE INDEX IF NOT EXISTS
            idx_paiements_created
            ON paiements(created_at);

        `);


        /* ====================================================
           INDEX DEMANDES PAIEMENT
        ==================================================== */

        await client.query(`

            CREATE INDEX IF NOT EXISTS
            idx_demandes_paiement_user
            ON demandes_paiement(user_id);

        `);


        await client.query(`

            CREATE INDEX IF NOT EXISTS
            idx_demandes_paiement_status
            ON demandes_paiement(status);

        `);


        await client.query(`

            CREATE INDEX IF NOT EXISTS
            idx_demandes_paiement_created
            ON demandes_paiement(created_at);

        `);


        console.log(
            "Base PostgreSQL prête."
        );


        console.log(
            "Table demandes_paiement prête."
        );


    } catch (err) {

        console.error(

            "Erreur initialisation PostgreSQL :",

            err

        );

        throw err;

    } finally {

        client.release();

    }

}


/* ============================================================
   14. ROUTE /
============================================================ */

app.get(

    "/",

    function(req, res) {

        res.json({

            success: true,

            service:
                "BMJ SERVICE BACKEND",

            version:
                "13.0.0",

            status:
                "online",

            database:
                "PostgreSQL",

            server:
                "Render",

            time:
                new Date().toISOString()

        });

    }

);


/* ============================================================
   15. ROUTE /api
============================================================ */

app.get(

    "/api",

    function(req, res) {

        success(

            res,

            {

                version:
                    "13.0.0",

                status:
                    "online",

                service:
                    "BMJ SERVICE API"

            },

            "API BMJ SERVICE opérationnelle"

        );

    }

);


/* ============================================================
   16. ROUTES DISPONIBLES
============================================================ */

const ROUTES = [

    {
        method: "GET",
        path: "/"
    },

    {
        method: "GET",
        path: "/api"
    },

    {
        method: "GET",
        path: "/api/routes"
    },

    {
        method: "GET",
        path: "/api/health"
    },

    {
        method: "GET",
        path: "/api/test-db"
    },


    /* UTILISATEURS */

    {
        method: "POST",
        path: "/api/inscription"
    },

    {
        method: "POST",
        path: "/api/register"
    },

    {
        method: "POST",
        path: "/api/signup"
    },

    {
        method: "POST",
        path: "/api/connexion"
    },

    {
        method: "POST",
        path: "/api/login"
    },

    {
        method: "POST",
        path: "/api/signin"
    },


    /* ADMIN */

    {
        method: "POST",
        path: "/api/admin/connexion"
    },

    {
        method: "POST",
        path: "/api/admin/login"
    },

    {
        method: "POST",
        path: "/api/admin/signin"
    },

    {
        method: "POST",
        path: "/api/admin/logout"
    },

    {
        method: "GET",
        path: "/api/admin/me"
    },

    {
        method: "GET",
        path: "/api/admin/dashboard"
    },

    {
        method: "GET",
        path: "/api/admin/utilisateurs"
    },

    {
        method: "GET",
        path: "/api/admin/users"
    },

    {
        method: "GET",
        path: "/api/admin/paiements"
    },

    {
        method: "GET",
        path: "/api/admin/payments"
    },

    {
        method: "GET",
        path: "/api/admin/statistiques"
    },


    /* UTILISATEURS */

    {
        method: "GET",
        path: "/api/utilisateurs"
    },

    {
        method: "GET",
        path: "/api/utilisateurs/:id"
    },

    {
        method: "POST",
        path: "/api/utilisateurs"
    },

    {
        method: "PUT",
        path: "/api/utilisateurs/:id"
    },

    {
        method: "PATCH",
        path: "/api/utilisateurs/:id"
    },

    {
        method: "DELETE",
        path: "/api/utilisateurs/:id"
    },

    {
        method: "GET",
        path: "/api/users"
    },

    {
        method: "GET",
        path: "/api/users/:id"
    },

    {
        method: "POST",
        path: "/api/users"
    },


    /* PAIEMENTS EXISTANTS */

    {
        method: "GET",
        path: "/api/paiements"
    },

    {
        method: "GET",
        path: "/api/paiements/:id"
    },

    {
        method: "POST",
        path: "/api/paiements"
    },

    {
        method: "POST",
        path: "/api/paiements/manual"
    },

    {
        method: "POST",
        path: "/api/admin/paiements/manual"
    },

    {
        method: "PUT",
        path: "/api/paiements/:id"
    },

    {
        method: "PATCH",
        path: "/api/paiements/:id"
    },

    {
        method: "DELETE",
        path: "/api/paiements/:id"
    },

    {
        method: "PATCH",
        path: "/api/paiements/:id/valider"
    },

    {
        method: "PATCH",
        path: "/api/paiements/:id/refuser"
    },

    {
        method: "PATCH",
        path: "/api/admin/paiements/:id/valider"
    },

    {
        method: "PATCH",
        path: "/api/admin/paiements/:id/refuser"
    },


    /* PREMIUM */

    {
        method: "PATCH",
        path: "/api/admin/users/:id/premium"
    },

    {
        method: "PATCH",
        path: "/api/admin/users/:id/block"
    },


    /* NOUVELLES DEMANDES DE PAIEMENT */

    {
        method: "POST",
        path: "/api/demandes-paiement"
    },

    {
        method: "GET",
        path: "/api/demandes-paiement"
    },

    {
        method: "GET",
        path: "/api/demandes-paiement/:id"
    },

    {
        method: "GET",
        path: "/api/admin/demandes-paiement"
    },

    {
        method: "GET",
        path: "/api/admin/demandes-paiement/:id"
    },

    {
        method: "PATCH",
        path: "/api/admin/demandes-paiement/:id/valider"
    },

    {
        method: "PATCH",
        path: "/api/admin/demandes-paiement/:id/refuser"
    },


    /* STATISTIQUES */

    {
        method: "GET",
        path: "/api/statistiques"
    }

];


app.get(

    "/api/routes",

    function(req, res) {

        success(

            res,

            {

                version:
                    "13.0.0",

                total:
                    ROUTES.length,

                routes:
                    ROUTES

            },

            "Liste complète des routes BMJ SERVICE"

        );

    }

);


/* ============================================================
   17. HEALTH
============================================================ */

app.get(

    "/api/health",

    async function(req, res) {

        try {

            const result =
                await pool.query(

                    "SELECT NOW() AS database_time"

                );


            success(

                res,

                {

                    server:
                        "online",

                    database:
                        "connected",

                    database_time:
                        result.rows[0]
                            .database_time,

                    time:
                        new Date()
                            .toISOString()

                },

                "Serveur opérationnel"

            );

        } catch (err) {

            return error(

                res,

                "Base de données indisponible.",

                503,

                err.message

            );

        }

    }

);


/* ============================================================
   18. TEST DATABASE
============================================================ */

app.get(

    "/api/test-db",

    async function(req, res) {

        try {

            const result =
                await pool.query(

                    "SELECT NOW() AS date"

                );


            success(

                res,

                result.rows[0],

                "Connexion PostgreSQL réussie"

            );

        } catch (err) {

            error(

                res,

                "Connexion PostgreSQL échouée.",

                500,

                err.message

            );

        }

    }

);


/* ============================================================
   19. INSCRIPTION
============================================================ */

async function registerUser(req, res) {

    try {

        const body =
            req.body || {};


        const nom =
            String(
                body.nom || ""
            ).trim();


        const email =
            normalizeEmail(
                body.email
            );


        const telephone =
            body.telephone ||
            null;


        const domaine =
            body.domaine ||
            null;


        const password =
            body.password ||
            body.motDePasse ||
            "";


        const photo =
            body.photo ||
            null;


        if (

            !nom ||
            !email ||
            !password

        ) {

            return error(

                res,

                "Nom, email et mot de passe obligatoires.",

                400

            );

        }


        const existing =
            await pool.query(

                `
                SELECT id
                FROM users
                WHERE LOWER(email)=LOWER($1)
                LIMIT 1
                `,

                [email]

            );


        if (
            existing.rows.length
        ) {

            return error(

                res,

                "Cette adresse email existe déjà.",

                409

            );

        }


        const result =
            await pool.query(

                `
                INSERT INTO users
                (
                    nom,
                    email,
                    telephone,
                    domaine,
                    password,
                    photo,
                    premium,
                    is_premium,
                    blocked,
                    is_blocked
                )

                VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    false,
                    false,
                    false,
                    false
                )

                RETURNING
                    id,
                    nom,
                    email,
                    telephone,
                    domaine,
                    photo,
                    premium,
                    is_premium,
                    premium_until,
                    blocked,
                    is_blocked,
                    created_at
                `,

                [

                    nom,
                    email,
                    telephone,
                    domaine,
                    password,
                    photo

                ]

            );


        const user =
            result.rows[0];


        await logActivity(

            "INSCRIPTION",

            `Nouvel utilisateur : ${email}`,

            user.id

        );


        return success(

            res,

            user,

            "Inscription réussie"

        );

    } catch (err) {

        return error(

            res,

            "Erreur lors de l'inscription.",

            500,

            err.message

        );

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


app.post(
    "/api/signup",
    registerUser
);


/* ============================================================
   20. CONNEXION UTILISATEUR
============================================================ */

async function loginUser(req, res) {

    try {

        const email =
            normalizeEmail(
                req.body.email
            );


        const password =
            req.body.password ||
            req.body.motDePasse ||
            "";


        if (

            !email ||
            !password

        ) {

            return error(

                res,

                "Email et mot de passe obligatoires.",

                400

            );

        }


        const result =
            await pool.query(

                `
                SELECT *
                FROM users
                WHERE LOWER(email)=LOWER($1)
                LIMIT 1
                `,

                [email]

            );


        if (
            !result.rows.length
        ) {

            return error(

                res,

                "Email ou mot de passe incorrect.",

                401

            );

        }


        const user =
            result.rows[0];


        if (

            user.blocked === true ||
            user.is_blocked === true

        ) {

            return error(

                res,

                "Votre compte est bloqué.",

                403

            );

        }


        if (

            String(user.password) !==
            String(password)

        ) {

            return error(

                res,

                "Email ou mot de passe incorrect.",

                401

            );

        }


        let premium =
            Boolean(

                user.premium ||
                user.is_premium

            );


        if (

            premium &&
            user.premium_until

        ) {

            const until =
                new Date(
                    user.premium_until
                );


            if (

                until < new Date()

            ) {

                await pool.query(

                    `
                    UPDATE users

                    SET
                        premium=false,
                        is_premium=false,
                        updated_at=CURRENT_TIMESTAMP

                    WHERE id=$1
                    `,

                    [user.id]

                );


                premium = false;

                user.premium = false;

                user.is_premium = false;

            }

        }


        return success(

            res,

            {

                user: {

                    id:
                        user.id,

                    nom:
                        user.nom,

                    email:
                        user.email,

                    telephone:
                        user.telephone,

                    domaine:
                        user.domaine,

                    photo:
                        user.photo,

                    premium,

                    is_premium:
                        premium,

                    premium_until:
                        user.premium_until,

                    blocked:
                        false,

                    is_blocked:
                        false

                }

            },

            "Connexion réussie"

        );

    } catch (err) {

        return error(

            res,

            "Erreur de connexion.",

            500,

            err.message

        );

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


app.post(
    "/api/signin",
    loginUser
);


/* ============================================================
   21. CONNEXION ADMIN
============================================================ */

async function adminLogin(req, res) {

    try {

        const email =
            normalizeEmail(
                req.body.email
            );


        const password =
            req.body.password ||
            req.body.motDePasse ||
            "";


        if (

            email !==
            ADMIN_EMAIL.toLowerCase()

        ) {

            return error(

                res,

                "Email administrateur incorrect.",

                401

            );

        }


        if (

            password !==
            ADMIN_PASSWORD

        ) {

            return error(

                res,

                "Mot de passe administrateur incorrect.",

                401

            );

        }


        const token =
            generateToken();


        await logActivity(

            "ADMIN_LOGIN",

            "Connexion administrateur"

        );


        return success(

            res,

            {

                token,

                admin: {

                    email:
                        ADMIN_EMAIL,

                    role:
                        "administrator",

                    nom:
                        "Administrateur BMJ SERVICE"

                }

            },

            "Connexion administrateur réussie"

        );

    } catch (err) {

        return error(

            res,

            "Erreur connexion administrateur.",

            500,

            err.message

        );

    }

}


app.post(
    "/api/admin/connexion",
    adminLogin
);


app.post(
    "/api/admin/login",
    adminLogin
);


app.post(
    "/api/admin/signin",
    adminLogin
);


/* ============================================================
   22. ADMIN LOGOUT
============================================================ */

app.post(

    "/api/admin/logout",

    adminAuth,

    async function(req, res) {

        await logActivity(

            "ADMIN_LOGOUT",

            "Déconnexion administrateur"

        );


        return success(

            res,

            null,

            "Déconnexion réussie"

        );

    }

);


/* ============================================================
   23. ADMIN ME
============================================================ */

app.get(

    "/api/admin/me",

    adminAuth,

    function(req, res) {

        return success(

            res,

            {

                email:
                    ADMIN_EMAIL,

                role:
                    "administrator",

                nom:
                    "Administrateur BMJ SERVICE"

            }

        );

    }

);


/* ============================================================
   24. DASHBOARD ADMIN
============================================================ */

app.get(

    "/api/admin/dashboard",

    adminAuth,

    async function(req, res) {

        try {

            const result =
                await pool.query(

                    `
                    SELECT

                        (
                            SELECT COUNT(*)
                            FROM users
                        )::int AS utilisateurs,

                        (
                            SELECT COUNT(*)
                            FROM users
                            WHERE premium=true
                               OR is_premium=true
                        )::int AS premium,

                        (
                            SELECT COUNT(*)
                            FROM users
                            WHERE blocked=true
                               OR is_blocked=true
                        )::int AS bloques,

                        (
                            SELECT COUNT(*)
                            FROM paiements
                        )::int AS paiements,

                        (
                            SELECT COUNT(*)
                            FROM paiements
                            WHERE LOWER(status)
                            IN (
                                'pending',
                                'en_attente',
                                'attente'
                            )
                        )::int AS en_attente,

                        (
                            SELECT COUNT(*)
                            FROM paiements
                            WHERE LOWER(status)
                            = 'validated'
                        )::int AS valides,

                        (
                            SELECT COUNT(*)
                            FROM paiements
                            WHERE LOWER(status)
                            = 'refused'
                        )::int AS refuses,

                        (
                            SELECT COUNT(*)
                            FROM demandes_paiement
                        )::int AS demandes_paiement,

                        (
                            SELECT COUNT(*)
                            FROM demandes_paiement
                            WHERE LOWER(
                                COALESCE(status,'pending')
                            )='pending'
                        )::int AS demandes_en_attente,

                        (
                            SELECT COUNT(*)
                            FROM demandes_paiement
                            WHERE LOWER(
                                COALESCE(status,'pending')
                            )='validated'
                        )::int AS demandes_validees,

                        (
                            SELECT COUNT(*)
                            FROM demandes_paiement
                            WHERE LOWER(
                                COALESCE(status,'pending')
                            )='refused'
                        )::int AS demandes_refusees,

                        (
                            SELECT COALESCE(
                                SUM(amount),
                                0
                            )
                            FROM paiements
                            WHERE LOWER(status)
                            = 'validated'
                        ) AS revenus

                    `

                );


            const recent =
                await pool.query(

                    `
                    SELECT

                        p.*,

                        u.nom
                            AS user_nom_db,

                        u.email
                            AS user_email_db,

                        u.telephone
                            AS user_telephone_db

                    FROM paiements p

                    LEFT JOIN users u
                        ON u.id=p.user_id

                    ORDER BY
                        p.created_at DESC

                    LIMIT 10
                    `

                );


            const recentDemandes =
                await pool.query(

                    `
                    SELECT

                        d.*,

                        u.nom
                            AS user_nom,

                        u.email
                            AS user_email,

                        u.telephone
                            AS user_telephone

                    FROM demandes_paiement d

                    LEFT JOIN users u
                        ON u.id=d.user_id

                    ORDER BY
                        d.created_at DESC

                    LIMIT 10
                    `

                );


            const stats =
                result.rows[0];


            return success(

                res,

                {

                    utilisateurs:
                        Number(
                            stats.utilisateurs
                        ),

                    users:
                        Number(
                            stats.utilisateurs
                        ),

                    premium:
                        Number(
                            stats.premium
                        ),

                    bloques:
                        Number(
                            stats.bloques
                        ),

                    utilisateurs_bloques:
                        Number(
                            stats.bloques
                        ),

                    paiements:
                        Number(
                            stats.paiements
                        ),

                    pending:
                        Number(
                            stats.en_attente
                        ),

                    paiements_en_attente:
                        Number(
                            stats.en_attente
                        ),

                    valides:
                        Number(
                            stats.valides
                        ),

                    refuses:
                        Number(
                            stats.refuses
                        ),

                    revenus:
                        stats.revenus,

                    demandes_paiement:
                        Number(
                            stats.demandes_paiement
                        ),

                    demandes_en_attente:
                        Number(
                            stats.demandes_en_attente
                        ),

                    demandes_validees:
                        Number(
                            stats.demandes_validees
                        ),

                    demandes_refusees:
                        Number(
                            stats.demandes_refusees
                        ),

                    paiements_recents:
                        recent.rows,

                    demandes_paiement_recentes:
                        recentDemandes.rows

                },

                "Tableau de bord chargé"

            );

        } catch (err) {

            return error(

                res,

                "Impossible de charger le tableau de bord.",

                500,

                err.message

            );

        }

    }

);


/* ============================================================
   25. LISTE UTILISATEURS ADMIN
============================================================ */

async function getAdminUsers(req, res) {

    try {

        const result =
            await pool.query(

                `
                SELECT

                    id,
                    nom,
                    email,
                    telephone,
                    domaine,
                    photo,
                    premium,
                    is_premium,
                    premium_until,
                    blocked,
                    is_blocked,
                    created_at,
                    updated_at

                FROM users

                ORDER BY
                    created_at DESC
                `

            );


        return success(

            res,

            result.rows,

            "Utilisateurs chargés"

        );

    } catch (err) {

        return error(

            res,

            "Impossible de charger les utilisateurs.",

            500,

            err.message

        );

    }

}


app.get(

    "/api/admin/utilisateurs",

    adminAuth,

    getAdminUsers

);


app.get(

    "/api/admin/users",

    adminAuth,

    getAdminUsers

);


/* ============================================================
   26. UTILISATEURS PUBLICS
============================================================ */

async function getUsersPublic(req, res) {

    try {

        const result =
            await pool.query(

                `
                SELECT

                    id,
                    nom,
                    email,
                    telephone,
                    domaine,
                    photo,
                    premium,
                    is_premium,
                    premium_until,
                    blocked,
                    is_blocked,
                    created_at

                FROM users

                ORDER BY
                    created_at DESC
                `

            );


        return success(

            res,

            result.rows,

            "Utilisateurs chargés"

        );

    } catch (err) {

        return error(

            res,

            "Impossible de charger les utilisateurs.",

            500,

            err.message

        );

    }

}


app.get(
    "/api/utilisateurs",
    getUsersPublic
);


app.get(
    "/api/users",
    getUsersPublic
);


/* ============================================================
   27. UTILISATEUR PAR ID
============================================================ */

async function getUserById(req, res) {

    try {

        const id =
            parseId(
                req.params.id
            );


        if (!id) {

            return error(

                res,

                "ID utilisateur invalide.",

                400

            );

        }


        const result =
            await pool.query(

                `
                SELECT

                    id,
                    nom,
                    email,
                    telephone,
                    domaine,
                    photo,
                    premium,
                    is_premium,
                    premium_until,
                    blocked,
                    is_blocked,
                    created_at,
                    updated_at

                FROM users

                WHERE id=$1
                `,

                [id]

            );


        if (!result.rows.length) {

            return error(

                res,

                "Utilisateur introuvable.",

                404

            );

        }


        return success(

            res,

            result.rows[0]

        );

    } catch (err) {

        return error(

            res,

            "Erreur utilisateur.",

            500,

            err.message

        );

    }

}


app.get(
    "/api/utilisateurs/:id",
    getUserById
);


app.get(
    "/api/users/:id",
    getUserById
);


/* ============================================================
   28. CRÉATION UTILISATEUR
============================================================ */

app.post(

    "/api/utilisateurs",

    registerUser

);


app.post(

    "/api/users",

    registerUser

);


/* ============================================================
   29. MODIFICATION UTILISATEUR
============================================================ */

async function updateUser(req, res) {

    try {

        const id =
            parseId(
                req.params.id
            );


        if (!id) {

            return error(

                res,

                "ID utilisateur invalide.",

                400

            );

        }


        const body =
            req.body || {};


        const nom =
            body.nom !== undefined
                ? body.nom
                : null;


        const email =
            body.email !== undefined
                ? normalizeEmail(
                    body.email
                )
                : null;


        const telephone =
            body.telephone !== undefined
                ? body.telephone
                : null;


        const domaine =
            body.domaine !== undefined
                ? body.domaine
                : null;


        const photo =
            body.photo !== undefined
                ? body.photo
                : null;


        if (email) {

            const emailCheck =
                await pool.query(

                    `
                    SELECT id
                    FROM users
                    WHERE LOWER(email)=LOWER($1)
                    AND id<>$2
                    LIMIT 1
                    `,

                    [
                        email,
                        id
                    ]

                );


            if (
                emailCheck.rows.length
            ) {

                return error(

                    res,

                    "Cette adresse email est déjà utilisée.",

                    409

                );

            }

        }


        const result =
            await pool.query(

                `
                UPDATE users

                SET

                    nom =
                        COALESCE($1,nom),

                    email =
                        COALESCE($2,email),

                    telephone =
                        COALESCE($3,telephone),

                    domaine =
                        COALESCE($4,domaine),

                    photo =
                        COALESCE($5,photo),

                    updated_at =
                        CURRENT_TIMESTAMP

                WHERE id=$6

                RETURNING

                    id,
                    nom,
                    email,
                    telephone,
                    domaine,
                    photo,
                    premium,
                    is_premium,
                    premium_until,
                    blocked,
                    is_blocked,
                    created_at,
                    updated_at
                `,

                [

                    nom,
                    email,
                    telephone,
                    domaine,
                    photo,
                    id

                ]

            );


        if (!result.rows.length) {

            return error(

                res,

                "Utilisateur introuvable.",

                404

            );

        }


        await logActivity(

            "UPDATE_USER",

            `Utilisateur ${id} modifié`,

            id

        );


        return success(

            res,

            result.rows[0],

            "Utilisateur modifié"

        );

    } catch (err) {

        return error(

            res,

            "Impossible de modifier l'utilisateur.",

            500,

            err.message

        );

    }

}


app.put(

    "/api/utilisateurs/:id",

    adminAuth,

    updateUser

);


app.patch(

    "/api/utilisateurs/:id",

    adminAuth,

    updateUser

);


/* ============================================================
   30. SUPPRESSION UTILISATEUR
============================================================ */

async function deleteUser(req, res) {

    try {

        const id =
            parseId(
                req.params.id
            );


        if (!id) {

            return error(

                res,

                "ID utilisateur invalide.",

                400

            );

        }


        await pool.query(

            `
            UPDATE paiements

            SET user_id=NULL

            WHERE user_id=$1
            `,

            [id]

        );


        /*
           Les nouvelles demandes de paiement
           restent conservées dans la base,
           mais leur user_id est retiré.
        */

        await pool.query(

            `
            UPDATE demandes_paiement

            SET user_id=NULL

            WHERE user_id=$1
            `,

            [id]

        );


        const result =
            await pool.query(

                `
                DELETE FROM users

                WHERE id=$1

                RETURNING id
                `,

                [id]

            );


        if (!result.rows.length) {

            return error(

                res,

                "Utilisateur introuvable.",

                404

            );

        }


        await logActivity(

            "DELETE_USER",

            `Utilisateur ${id} supprimé`,

            id

        );


        return success(

            res,

            result.rows[0],

            "Utilisateur supprimé"

        );

    } catch (err) {

        return error(

            res,

            "Impossible de supprimer l'utilisateur.",

            500,

            err.message

        );

    }

}


app.delete(

    "/api/utilisateurs/:id",

    adminAuth,

    deleteUser

);


/* ============================================================
   31. LISTE DES PAIEMENTS EXISTANTS
============================================================ */

async function getPayments(req, res) {

    try {

        const result =
            await pool.query(

                `
                SELECT

                    p.*,

                    u.nom
                        AS user_nom_db,

                    u.email
                        AS user_email_db,

                    u.telephone
                        AS user_telephone_db

                FROM paiements p

                LEFT JOIN users u
                    ON u.id=p.user_id

                ORDER BY
                    p.created_at DESC
                `

            );


        const data =
            result.rows.map(

                function(payment) {

                    return {

                        ...payment,

                        nom:
                            payment.nom ||
                            payment.user_nom_db ||
                            null,

                        email:
                            payment.email ||
                            payment.user_email_db ||
                            null,

                        telephone:
                            payment.telephone ||
                            payment.user_telephone_db ||
                            null,

                        amount:
                            payment.amount ??
                            payment.montant ??
                            0,

                        montant:
                            payment.montant ??
                            payment.amount ??
                            0,

                        method:
                            payment.method ||
                            payment.methode ||
                            null,

                        methode:
                            payment.methode ||
                            payment.method ||
                            null,

                        reference:
                            payment.reference ||
                            payment.transaction_id ||
                            null,

                        transaction_id:
                            payment.transaction_id ||
                            payment.reference ||
                            null,

                        proof:
                            payment.proof ||
                            payment.preuve ||
                            null,

                        preuve:
                            payment.preuve ||
                            payment.proof ||
                            null,

                        status:
                            payment.status ||
                            "pending"

                    };

                }

            );


        return success(

            res,

            data,

            "Paiements chargés"

        );

    } catch (err) {

        return error(

            res,

            "Impossible de charger les paiements.",

            500,

            err.message

        );

    }

}


app.get(

    "/api/paiements",

    getPayments

);


app.get(

    "/api/admin/paiements",

    adminAuth,

    getPayments

);


app.get(

    "/api/admin/payments",

    adminAuth,

    getPayments

);


/* ============================================================
   32. PAIEMENT PAR ID
============================================================ */

async function getPaymentById(req, res) {

    try {

        const id =
            parseId(
                req.params.id
            );


        if (!id) {

            return error(

                res,

                "ID paiement invalide.",

                400

            );

        }


        const result =
            await pool.query(

                `
                SELECT

                    p.*,

                    u.nom
                        AS user_nom_db,

                    u.email
                        AS user_email_db,

                    u.telephone
                        AS user_telephone_db

                FROM paiements p

                LEFT JOIN users u
                    ON u.id=p.user_id

                WHERE p.id=$1
                `,

                [id]

            );


        if (!result.rows.length) {

            return error(

                res,

                "Paiement introuvable.",

                404

            );

        }


        return success(

            res,

            result.rows[0],

            "Paiement trouvé"

        );

    } catch (err) {

        return error(

            res,

            "Erreur paiement.",

            500,

            err.message

        );

    }

}


app.get(

    "/api/paiements/:id",

    getPaymentById

);


/* ============================================================
   33. CRÉER PAIEMENT EXISTANT
============================================================ */

async function createPayment(req, res) {

    try {

        const body =
            req.body || {};


        const userId =
            body.user_id ||
            body.userId ||
            null;


        const amount =
            Number(

                body.amount ??
                body.montant ??
                0

            );


        if (

            !Number.isFinite(amount) ||
            amount < 0

        ) {

            return error(

                res,

                "Montant du paiement invalide.",

                400

            );

        }


        const currency =
            body.currency ||
            "USD";


        const method =
            body.method ||
            body.methode ||
            body.mode_paiement ||
            null;


        const reference =
            body.reference ||
            body.transaction_id ||
            body.transactionId ||
            null;


        const proof =
            body.preuve ||
            body.proof ||
            body.image ||
            null;


        let user =
            null;


        if (userId) {

            const userResult =
                await pool.query(

                    `
                    SELECT *
                    FROM users
                    WHERE id=$1
                    `,

                    [userId]

                );


            if (
                !userResult.rows.length
            ) {

                return error(

                    res,

                    "Utilisateur associé introuvable.",

                    404

                );

            }


            user =
                userResult.rows[0];

        }


        const nom =
            body.nom ||
            (user && user.nom) ||
            null;


        const email =
            body.email ||
            (user && user.email) ||
            null;


        const telephone =
            body.telephone ||
            (user && user.telephone) ||
            null;


        const premiumDays =
            Number(

                body.premium_days ??
                body.premiumDays ??
                30

            );


        if (

            !Number.isInteger(
                premiumDays
            ) ||

            premiumDays <= 0

        ) {

            return error(

                res,

                "Nombre de jours Premium invalide.",

                400

            );

        }


        const result =
            await pool.query(

                `
                INSERT INTO paiements
                (
                    user_id,
                    nom,
                    email,
                    telephone,
                    amount,
                    montant,
                    currency,
                    methode,
                    method,
                    reference,
                    transaction_id,
                    preuve,
                    proof,
                    status,
                    premium_days,
                    notes
                )

                VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $5,
                    $6,
                    $7,
                    $7,
                    $8,
                    $8,
                    $9,
                    $9,
                    'pending',
                    $10,
                    $11
                )

                RETURNING *
                `,

                [

                    userId,
                    nom,
                    email,
                    telephone,
                    amount,
                    currency,
                    method,
                    reference,
                    proof,
                    premiumDays,
                    body.notes || null

                ]

            );


        const payment =
            result.rows[0];


        await logActivity(

            "CREATE_PAYMENT",

            `Paiement ${payment.id} créé pour ${email || "utilisateur"}`,

            userId,

            payment.id

        );


        return success(

            res,

            payment,

            "Paiement enregistré avec succès"

        );

    } catch (err) {

        return error(

            res,

            "Impossible d'enregistrer le paiement.",

            500,

            err.message

        );

    }

}


app.post(

    "/api/paiements",

    createPayment

);


app.post(

    "/api/paiements/manual",

    adminAuth,

    createPayment

);


app.post(

    "/api/admin/paiements/manual",

    adminAuth,

    createPayment

);


/* ============================================================
   34. VALIDATION PAIEMENT EXISTANT
============================================================ */

async function validatePayment(req, res) {

    const client =
        await pool.connect();


    try {

        await client.query(
            "BEGIN"
        );


        const id =
            parseId(
                req.params.id
            );


        if (!id) {

            await client.query(
                "ROLLBACK"
            );


            return error(

                res,

                "ID paiement invalide.",

                400

            );

        }


        const paymentResult =
            await client.query(

                `
                SELECT *
                FROM paiements
                WHERE id=$1
                FOR UPDATE
                `,

                [id]

            );


        if (
            !paymentResult.rows.length
        ) {

            await client.query(
                "ROLLBACK"
            );


            return error(

                res,

                "Paiement introuvable.",

                404

            );

        }


        const payment =
            paymentResult.rows[0];


        const status =
            String(
                payment.status || ""
            ).toLowerCase();


        if (
            status === "validated"
        ) {

            await client.query(
                "ROLLBACK"
            );


            return error(

                res,

                "Ce paiement est déjà validé.",

                409

            );

        }


        if (
            status === "refused"
        ) {

            await client.query(
                "ROLLBACK"
            );


            return error(

                res,

                "Ce paiement a déjà été refusé.",

                409

            );

        }


        const userId =
            payment.user_id;


        if (!userId) {

            await client.query(
                "ROLLBACK"
            );


            return error(

                res,

                "Ce paiement n'est associé à aucun utilisateur.",

                400

            );

        }


        const userResult =
            await client.query(

                `
                SELECT *
                FROM users
                WHERE id=$1
                FOR UPDATE
                `,

                [userId]

            );


        if (
            !userResult.rows.length
        ) {

            await client.query(
                "ROLLBACK"
            );


            return error(

                res,

                "Utilisateur associé introuvable.",

                404

            );

        }


        const user =
            userResult.rows[0];


        const days =
            Number(
                payment.premium_days ||
                30
            );


        const now =
            new Date();


        let baseDate =
            now;


        if (
            user.premium_until
        ) {

            const currentUntil =
                new Date(
                    user.premium_until
                );


            if (
                currentUntil > now
            ) {

                baseDate =
                    currentUntil;

            }

        }


        const newPremiumUntil =
            new Date(
                baseDate
            );


        newPremiumUntil.setDate(

            newPremiumUntil.getDate() +
            days

        );


        await client.query(

            `
            UPDATE users

            SET

                premium=true,

                is_premium=true,

                premium_until=$1,

                updated_at=CURRENT_TIMESTAMP

            WHERE id=$2
            `,

            [

                newPremiumUntil,
                userId

            ]

        );


        const updatedPayment =
            await client.query(

                `
                UPDATE paiements

                SET

                    status='validated',

                    validated_at=
                        CURRENT_TIMESTAMP,

                    updated_at=
                        CURRENT_TIMESTAMP

                WHERE id=$1

                RETURNING *
                `,

                [id]

            );


        await client.query(
            "COMMIT"
        );


        await logActivity(

            "VALIDATE_PAYMENT",

            `Paiement ${id} validé - Premium activé`,

            userId,

            id

        );


        return success(

            res,

            {

                payment:
                    updatedPayment.rows[0],

                user_id:
                    userId,

                premium:
                    true,

                is_premium:
                    true,

                premium_until:
                    newPremiumUntil,

                premium_days:
                    days

            },

            "Paiement validé et Premium activé"

        );

    } catch (err) {

        try {

            await client.query(
                "ROLLBACK"
            );

        } catch (_) {}


        return error(

            res,

            "Impossible de valider le paiement.",

            500,

            err.message

        );

    } finally {

        client.release();

    }

}


app.patch(

    "/api/paiements/:id/valider",

    adminAuth,

    validatePayment

);


app.patch(

    "/api/admin/paiements/:id/valider",

    adminAuth,

    validatePayment

);


/* ============================================================
   35. REFUS PAIEMENT EXISTANT
============================================================ */

async function refusePayment(req, res) {

    try {

        const id =
            parseId(
                req.params.id
            );


        if (!id) {

            return error(

                res,

                "ID paiement invalide.",

                400

            );

        }


        const reason =
            req.body.reason ||
            req.body.motif ||
            req.body.refusal_reason ||
            "Paiement refusé par l'administrateur";


        const result =
            await pool.query(

                `
                UPDATE paiements

                SET

                    status='refused',

                    refusal_reason=$1,

                    refused_at=
                        CURRENT_TIMESTAMP,

                    updated_at=
                        CURRENT_TIMESTAMP

                WHERE id=$2

                AND LOWER(
                    COALESCE(status,'pending')
                ) <> 'validated'

                RETURNING *
                `,

                [

                    reason,
                    id

                ]

            );


        if (!result.rows.length) {

            const check =
                await pool.query(

                    `
                    SELECT id,status
                    FROM paiements
                    WHERE id=$1
                    `,

                    [id]

                );


            if (!check.rows.length) {

                return error(

                    res,

                    "Paiement introuvable.",

                    404

                );

            }


            return error(

                res,

                "Un paiement déjà validé ne peut pas être refusé.",

                409

            );

        }


        const payment =
            result.rows[0];


        await logActivity(

            "REFUSE_PAYMENT",

            `Paiement ${id} refusé : ${reason}`,

            payment.user_id,

            id

        );


        return success(

            res,

            payment,

            "Paiement refusé"

        );

    } catch (err) {

        return error(

            res,

            "Impossible de refuser le paiement.",

            500,

            err.message

        );

    }

}


app.patch(

    "/api/paiements/:id/refuser",

    adminAuth,

    refusePayment

);


app.patch(

    "/api/admin/paiements/:id/refuser",

    adminAuth,

    refusePayment

);


/* ============================================================
   36. MODIFIER PAIEMENT EXISTANT
============================================================ */

async function updatePayment(req, res) {

    try {

        const id =
            parseId(
                req.params.id
            );


        if (!id) {

            return error(

                res,

                "ID paiement invalide.",

                400

            );

        }


        const body =
            req.body || {};


        const status =
            body.status !== undefined
                ? body.status
                : null;


        const reference =
            body.reference ||
            body.transaction_id ||
            body.transactionId ||
            null;


        const method =
            body.method ||
            body.methode ||
            body.mode_paiement ||
            null;


        const notes =
            body.notes !== undefined
                ? body.notes
                : null;


        const refusalReason =
            body.refusal_reason ||
            body.reason ||
            body.motif ||
            null;


        const amount =
            body.amount ??
            body.montant ??
            null;


        const currency =
            body.currency ||
            null;


        const result =
            await pool.query(

                `
                UPDATE paiements

                SET

                    status =
                        COALESCE(
                            $1,
                            status
                        ),

                    reference =
                        COALESCE(
                            $2,
                            reference
                        ),

                    transaction_id =
                        COALESCE(
                            $2,
                            transaction_id
                        ),

                    methode =
                        COALESCE(
                            $3,
                            methode
                        ),

                    method =
                        COALESCE(
                            $3,
                            method
                        ),

                    amount =
                        COALESCE(
                            $4,
                            amount
                        ),

                    montant =
                        COALESCE(
                            $4,
                            montant
                        ),

                    currency =
                        COALESCE(
                            $5,
                            currency
                        ),

                    notes =
                        COALESCE(
                            $6,
                            notes
                        ),

                    refusal_reason =
                        COALESCE(
                            $7,
                            refusal_reason
                        ),

                    updated_at =
                        CURRENT_TIMESTAMP

                WHERE id=$8

                RETURNING *
                `,

                [

                    status,
                    reference,
                    method,
                    amount,
                    currency,
                    notes,
                    refusalReason,
                    id

                ]

            );


        if (!result.rows.length) {

            return error(

                res,

                "Paiement introuvable.",

                404

            );

        }


        await logActivity(

            "UPDATE_PAYMENT",

            `Paiement ${id} modifié`,

            result.rows[0].user_id,

            id

        );


        return success(

            res,

            result.rows[0],

            "Paiement modifié"

        );

    } catch (err) {

        return error(

            res,

            "Impossible de modifier le paiement.",

            500,

            err.message

        );

    }

}


app.put(

    "/api/paiements/:id",

    adminAuth,

    updatePayment

);


app.patch(

    "/api/paiements/:id",

    adminAuth,

    updatePayment

);


/* ============================================================
   37. SUPPRIMER PAIEMENT EXISTANT
============================================================ */

app.delete(

    "/api/paiements/:id",

    adminAuth,

    async function(req, res) {

        try {

            const id =
                parseId(
                    req.params.id
                );


            if (!id) {

                return error(

                    res,

                    "ID paiement invalide.",

                    400

                );

            }


            const result =
                await pool.query(

                    `
                    DELETE FROM paiements

                    WHERE id=$1

                    RETURNING
                        id,
                        user_id
                    `,

                    [id]

                );


            if (!result.rows.length) {

                return error(

                    res,

                    "Paiement introuvable.",

                    404

                );

            }


            await logActivity(

                "DELETE_PAYMENT",

                `Paiement ${id} supprimé`,

                null,

                id

            );


            return success(

                res,

                result.rows[0],

                "Paiement supprimé"

            );

        } catch (err) {

            return error(

                res,

                "Impossible de supprimer le paiement.",

                500,

                err.message

            );

        }

    }

);


/* ============================================================
   38. PREMIUM MANUEL
============================================================ */

app.patch(

    "/api/admin/users/:id/premium",

    adminAuth,

    async function(req, res) {

        try {

            const id =
                parseId(
                    req.params.id
                );


            if (!id) {

                return error(

                    res,

                    "ID utilisateur invalide.",

                    400

                );

            }


            const enabled =
                req.body.enabled !== undefined

                    ? getBoolean(
                        req.body.enabled
                    )

                    : true;


            const days =
                Number(

                    req.body.days ??
                    req.body.premium_days ??
                    30

                );


            if (

                enabled &&

                (

                    !Number.isInteger(days) ||
                    days <= 0

                )

            ) {

                return error(

                    res,

                    "Nombre de jours Premium invalide.",

                    400

                );

            }


            let premiumUntil =
                null;


            if (enabled) {

                const existing =
                    await pool.query(

                        `
                        SELECT premium_until

                        FROM users

                        WHERE id=$1
                        `,

                        [id]

                    );


                if (
                    !existing.rows.length
                ) {

                    return error(

                        res,

                        "Utilisateur introuvable.",

                        404

                    );

                }


                const now =
                    new Date();


                let base =
                    now;


                if (
                    existing.rows[0]
                        .premium_until
                ) {

                    const current =
                        new Date(

                            existing.rows[0]
                                .premium_until

                        );


                    if (
                        current > now
                    ) {

                        base =
                            current;

                    }

                }


                premiumUntil =
                    new Date(base);


                premiumUntil.setDate(

                    premiumUntil.getDate() +
                    days

                );

            }


            const result =
                await pool.query(

                    `
                    UPDATE users

                    SET

                        premium=$1,

                        is_premium=$1,

                        premium_until=$2,

                        updated_at=
                            CURRENT_TIMESTAMP

                    WHERE id=$3

                    RETURNING

                        id,
                        nom,
                        email,
                        premium,
                        is_premium,
                        premium_until
                    `,

                    [

                        enabled,
                        premiumUntil,
                        id

                    ]

                );


            if (!result.rows.length) {

                return error(

                    res,

                    "Utilisateur introuvable.",

                    404

                );

            }


            await logActivity(

                enabled
                    ? "ENABLE_PREMIUM"
                    : "DISABLE_PREMIUM",

                enabled
                    ? `Premium activé pour utilisateur ${id} pendant ${days} jours`
                    : `Premium désactivé pour utilisateur ${id}`,

                id

            );


            return success(

                res,

                {

                    ...result.rows[0],

                    premium_days:
                        enabled
                            ? days
                            : 0

                },

                enabled
                    ? "Premium activé"
                    : "Premium désactivé"

            );

        } catch (err) {

            return error(

                res,

                "Impossible de modifier Premium.",

                500,

                err.message

            );

        }

    }

);


/* ============================================================
   39. BLOQUER / DÉBLOQUER UTILISATEUR
============================================================ */

app.patch(

    "/api/admin/users/:id/block",

    adminAuth,

    async function(req, res) {

        try {

            const id =
                parseId(
                    req.params.id
                );


            if (!id) {

                return error(

                    res,

                    "ID utilisateur invalide.",

                    400

                );

            }


            const blocked =
                req.body.blocked !== undefined

                    ? getBoolean(
                        req.body.blocked
                    )

                    : true;


            const result =
                await pool.query(

                    `
                    UPDATE users

                    SET

                        blocked=$1,

                        is_blocked=$1,

                        updated_at=
                            CURRENT_TIMESTAMP

                    WHERE id=$2

                    RETURNING

                        id,
                        nom,
                        email,
                        blocked,
                        is_blocked
                    `,

                    [

                        blocked,
                        id

                    ]

                );


            if (!result.rows.length) {

                return error(

                    res,

                    "Utilisateur introuvable.",

                    404

                );

            }


            await logActivity(

                blocked
                    ? "BLOCK_USER"
                    : "UNBLOCK_USER",

                blocked
                    ? `Utilisateur ${id} bloqué`
                    : `Utilisateur ${id} débloqué`,

                id

            );


            return success(

                res,

                result.rows[0],

                blocked
                    ? "Utilisateur bloqué"
                    : "Utilisateur débloqué"

            );

        } catch (err) {

            return error(

                res,

                "Impossible de modifier le blocage.",

                500,

                err.message

            );

        }

    }

);


/* ============================================================
   40. NOUVELLE FONCTIONNALITÉ
   DEMANDE DE PAIEMENT UTILISATEUR
============================================================ */

/*
   IMPORTANT :

   Cette route est complètement indépendante
   de /api/paiements.

   La page utilisateur doit envoyer :

   POST /api/demandes-paiement

   BODY :

   {
       "user_id": 12,
       "telephone_paiement": "0991234567",
       "reference_paiement": "ABC123456"
   }

   Rien d'autre n'est nécessaire.
*/


async function createPaymentRequest(req, res) {

    try {

        const body =
            req.body || {};


        const userId =
            parseId(

                body.user_id ??
                body.userId

            );


        const telephonePaiement =
            String(

                body.telephone_paiement ??
                body.telephonePaiement ??
                body.numero_paiement ??
                body.numeroPaiement ??
                ""

            ).trim();


        const referencePaiement =
            String(

                body.reference_paiement ??
                body.referencePaiement ??
                body.reference ??
                ""

            ).trim();


        /* ====================================================
           VALIDATION
        ==================================================== */

        if (!userId) {

            return error(

                res,

                "Utilisateur invalide.",

                400

            );

        }


        if (!telephonePaiement) {

            return error(

                res,

                "Le numéro ayant effectué le paiement est obligatoire.",

                400

            );

        }


        if (!referencePaiement) {

            return error(

                res,

                "La référence du paiement est obligatoire.",

                400

            );

        }


        if (

            telephonePaiement.length < 6 ||
            telephonePaiement.length > 100

        ) {

            return error(

                res,

                "Numéro de paiement invalide.",

                400

            );

        }


        if (

            referencePaiement.length < 2 ||
            referencePaiement.length > 255

        ) {

            return error(

                res,

                "Référence de paiement invalide.",

                400

            );

        }


        /* ====================================================
           VÉRIFICATION UTILISATEUR
        ==================================================== */

        const userResult =
            await pool.query(

                `
                SELECT

                    id,
                    nom,
                    email,
                    telephone,
                    premium,
                    is_premium,
                    premium_until,
                    blocked,
                    is_blocked

                FROM users

                WHERE id=$1

                LIMIT 1
                `,

                [userId]

            );


        if (!userResult.rows.length) {

            return error(

                res,

                "Utilisateur introuvable.",

                404

            );

        }


        const user =
            userResult.rows[0];


        if (

            user.blocked === true ||
            user.is_blocked === true

        ) {

            return error(

                res,

                "Votre compte est bloqué.",

                403

            );

        }


        /* ====================================================
           EMPÊCHER UNE DOUBLE DEMANDE EN ATTENTE
        ==================================================== */

        const pending =
            await pool.query(

                `
                SELECT id

                FROM demandes_paiement

                WHERE user_id=$1

                AND LOWER(
                    COALESCE(status,'pending')
                )='pending'

                LIMIT 1
                `,

                [userId]

            );


        if (pending.rows.length) {

            return error(

                res,

                "Vous avez déjà une demande de paiement en attente.",

                409,

                {

                    demande_id:
                        pending.rows[0].id

                }

            );

        }


        /* ====================================================
           EMPÊCHER UNE RÉFÉRENCE DÉJÀ UTILISÉE
        ==================================================== */

        const referenceUsed =
            await pool.query(

                `
                SELECT id

                FROM demandes_paiement

                WHERE LOWER(
                    reference_paiement
                )=LOWER($1)

                LIMIT 1
                `,

                [referencePaiement]

            );


        if (
            referenceUsed.rows.length
        ) {

            return error(

                res,

                "Cette référence de paiement a déjà été utilisée.",

                409

            );

        }


        /* ====================================================
           CRÉATION
        ==================================================== */

        const result =
            await pool.query(

                `
                INSERT INTO demandes_paiement
                (
                    user_id,
                    telephone_paiement,
                    reference_paiement,
                    status
                )

                VALUES
                (
                    $1,
                    $2,
                    $3,
                    'pending'
                )

                RETURNING
                    id,
                    user_id,
                    telephone_paiement,
                    reference_paiement,
                    status,
                    created_at,
                    updated_at
                `,

                [

                    userId,
                    telephonePaiement,
                    referencePaiement

                ]

            );


        const demande =
            result.rows[0];


        await logActivity(

            "CREATE_PAYMENT_REQUEST",

            `Demande de paiement ${demande.id} créée pour utilisateur ${userId}`,

            userId

        );


        return success(

            res,

            {

                ...demande,

                user: {

                    id:
                        user.id,

                    nom:
                        user.nom,

                    email:
                        user.email

                }

            },

            "Votre demande de paiement a été enregistrée."

        );

    } catch (err) {

        return error(

            res,

            "Impossible d'enregistrer la demande de paiement.",

            500,

            err.message

        );

    }

}


/* ============================================================
   ROUTE PRINCIPALE DEMANDE PAIEMENT
============================================================ */

app.post(

    "/api/demandes-paiement",

    createPaymentRequest

);


/* ============================================================
   41. LISTE DEMANDES DE PAIEMENT
============================================================ */

async function getPaymentRequests(req, res) {

    try {

        const result =
            await pool.query(

                `
                SELECT

                    d.id,

                    d.user_id,

                    d.telephone_paiement,

                    d.reference_paiement,

                    d.status,

                    d.refusal_reason,

                    d.created_at,

                    d.validated_at,

                    d.refused_at,

                    d.updated_at,

                    u.nom
                        AS user_nom,

                    u.email
                        AS user_email,

                    u.telephone
                        AS user_telephone,

                    u.domaine
                        AS user_domaine

                FROM demandes_paiement d

                LEFT JOIN users u
                    ON u.id=d.user_id

                ORDER BY
                    d.created_at DESC
                `

            );


        return success(

            res,

            result.rows,

            "Demandes de paiement chargées"

        );

    } catch (err) {

        return error(

            res,

            "Impossible de charger les demandes de paiement.",

            500,

            err.message

        );

    }

}


/*
   Cette route reste disponible pour consultation,
   mais l'administration doit utiliser la route admin
   pour la gestion.
*/

app.get(

    "/api/demandes-paiement",

    getPaymentRequests

);


app.get(

    "/api/admin/demandes-paiement",

    adminAuth,

    getPaymentRequests

);


/* ============================================================
   42. DEMANDE DE PAIEMENT PAR ID
============================================================ */

async function getPaymentRequestById(req, res) {

    try {

        const id =
            parseId(
                req.params.id
            );


        if (!id) {

            return error(

                res,

                "ID de demande invalide.",

                400

            );

        }


        const result =
            await pool.query(

                `
                SELECT

                    d.*,

                    u.nom
                        AS user_nom,

                    u.email
                        AS user_email,

                    u.telephone
                        AS user_telephone,

                    u.domaine
                        AS user_domaine,

                    u.premium
                        AS user_premium,

                    u.is_premium
                        AS user_is_premium,

                    u.premium_until
                        AS user_premium_until

                FROM demandes_paiement d

                LEFT JOIN users u
                    ON u.id=d.user_id

                WHERE d.id=$1

                LIMIT 1
                `,

                [id]

            );


        if (!result.rows.length) {

            return error(

                res,

                "Demande de paiement introuvable.",

                404

            );

        }


        return success(

            res,

            result.rows[0],

            "Demande de paiement trouvée"

        );

    } catch (err) {

        return error(

            res,

            "Impossible de charger la demande de paiement.",

            500,

            err.message

        );

    }

}


app.get(

    "/api/demandes-paiement/:id",

    getPaymentRequestById

);


app.get(

    "/api/admin/demandes-paiement/:id",

    adminAuth,

    getPaymentRequestById

);


/* ============================================================
   43. VALIDATION DEMANDE DE PAIEMENT
============================================================ */

/*
   Lorsqu'une demande est validée :

   1. La demande passe à "validated"
   2. L'utilisateur passe Premium
   3. premium_until est calculé
   4. Le tout se fait dans une transaction PostgreSQL

   IMPORTANT :

   Cette validation n'utilise PAS la table paiements.
   Elle travaille uniquement avec :

       demandes_paiement
       users
*/


async function validatePaymentRequest(req, res) {

    const client =
        await pool.connect();


    try {

        await client.query(
            "BEGIN"
        );


        const id =
            parseId(
                req.params.id
            );


        if (!id) {

            await client.query(
                "ROLLBACK"
            );


            return error(

                res,

                "ID de demande invalide.",

                400

            );

        }


        /* ====================================================
           VERROUILLAGE DEMANDE
        ==================================================== */

        const demandeResult =
            await client.query(

                `
                SELECT *

                FROM demandes_paiement

                WHERE id=$1

                FOR UPDATE
                `,

                [id]

            );


        if (!demandeResult.rows.length) {

            await client.query(
                "ROLLBACK"
            );


            return error(

                res,

                "Demande de paiement introuvable.",

                404

            );

        }


        const demande =
            demandeResult.rows[0];


        const status =
            String(

                demande.status ||
                "pending"

            ).toLowerCase();


        if (
            status === "validated"
        ) {

            await client.query(
                "ROLLBACK"
            );


            return error(

                res,

                "Cette demande est déjà validée.",

                409

            );

        }


        if (
            status === "refused"
        ) {

            await client.query(
                "ROLLBACK"
            );


            return error(

                res,

                "Cette demande a déjà été refusée.",

                409

            );

        }


        const userId =
            parseId(
                demande.user_id
            );


        if (!userId) {

            await client.query(
                "ROLLBACK"
            );


            return error(

                res,

                "Cette demande n'est associée à aucun utilisateur.",

                400

            );

        }


        /* ====================================================
           VERROUILLAGE UTILISATEUR
        ==================================================== */

        const userResult =
            await client.query(

                `
                SELECT *

                FROM users

                WHERE id=$1

                FOR UPDATE
                `,

                [userId]

            );


        if (!userResult.rows.length) {

            await client.query(
                "ROLLBACK"
            );


            return error(

                res,

                "Utilisateur associé introuvable.",

                404

            );

        }


        const user =
            userResult.rows[0];


        if (

            user.blocked === true ||
            user.is_blocked === true

        ) {

            await client.query(
                "ROLLBACK"
            );


            return error(

                res,

                "Impossible d'activer Premium pour un utilisateur bloqué.",

                403

            );

        }


        /* ====================================================
           DURÉE PREMIUM
        ==================================================== */

        /*
           La durée par défaut reste de 30 jours,
           comme ton système Premium existant.
        */

        const days = 30;


        const now =
            new Date();


        let baseDate =
            now;


        if (
            user.premium_until
        ) {

            const currentUntil =
                new Date(
                    user.premium_until
                );


            if (
                currentUntil > now
            ) {

                baseDate =
                    currentUntil;

            }

        }


        const newPremiumUntil =
            new Date(
                baseDate
            );


        newPremiumUntil.setDate(

            newPremiumUntil.getDate() +
            days

        );


        /* ====================================================
           ACTIVATION PREMIUM
        ==================================================== */

        await client.query(

            `
            UPDATE users

            SET

                premium=true,

                is_premium=true,

                premium_until=$1,

                updated_at=
                    CURRENT_TIMESTAMP

            WHERE id=$2
            `,

            [

                newPremiumUntil,
                userId

            ]

        );


        /* ====================================================
           VALIDATION DEMANDE
        ==================================================== */

        const updated =
            await client.query(

                `
                UPDATE demandes_paiement

                SET

                    status='validated',

                    validated_at=
                        CURRENT_TIMESTAMP,

                    refused_at=NULL,

                    refusal_reason=NULL,

                    updated_at=
                        CURRENT_TIMESTAMP

                WHERE id=$1

                RETURNING *
                `,

                [id]

            );


        await client.query(
            "COMMIT"
        );


        await logActivity(

            "VALIDATE_PAYMENT_REQUEST",

            `Demande de paiement ${id} validée - Premium activé pour utilisateur ${userId}`,

            userId

        );


        return success(

            res,

            {

                demande:
                    updated.rows[0],

                user_id:
                    userId,

                premium:
                    true,

                is_premium:
                    true,

                premium_until:
                    newPremiumUntil,

                premium_days:
                    days

            },

            "Demande validée et Premium activé"

        );

    } catch (err) {

        try {

            await client.query(
                "ROLLBACK"
            );

        } catch (_) {}


        return error(

            res,

            "Impossible de valider la demande de paiement.",

            500,

            err.message

        );

    } finally {

        client.release();

    }

}


app.patch(

    "/api/admin/demandes-paiement/:id/valider",

    adminAuth,

    validatePaymentRequest

);


/* ============================================================
   44. REFUS DEMANDE DE PAIEMENT
============================================================ */

async function refusePaymentRequest(req, res) {

    try {

        const id =
            parseId(
                req.params.id
            );


        if (!id) {

            return error(

                res,

                "ID de demande invalide.",

                400

            );

        }


        const body =
            req.body || {};


        const reason =
            String(

                body.reason ||
                body.motif ||
                body.refusal_reason ||
                "Demande de paiement refusée par l'administrateur"

            ).trim();


        const result =
            await pool.query(

                `
                UPDATE demandes_paiement

                SET

                    status='refused',

                    refusal_reason=$1,

                    refused_at=
                        CURRENT_TIMESTAMP,

                    updated_at=
                        CURRENT_TIMESTAMP

                WHERE id=$2

                AND LOWER(
                    COALESCE(status,'pending')
                ) <> 'validated'

                RETURNING *
                `,

                [

                    reason,
                    id

                ]

            );


        if (!result.rows.length) {

            const check =
                await pool.query(

                    `
                    SELECT

                        id,
                        status

                    FROM demandes_paiement

                    WHERE id=$1
                    `,

                    [id]

                );


            if (!check.rows.length) {

                return error(

                    res,

                    "Demande de paiement introuvable.",

                    404

                );

            }


            return error(

                res,

                "Une demande déjà validée ne peut pas être refusée.",

                409

            );

        }


        const demande =
            result.rows[0];


        await logActivity(

            "REFUSE_PAYMENT_REQUEST",

            `Demande ${id} refusée : ${reason}`,

            demande.user_id

        );


        return success(

            res,

            demande,

            "Demande de paiement refusée"

        );

    } catch (err) {

        return error(

            res,

            "Impossible de refuser la demande de paiement.",

            500,

            err.message

        );

    }

}


app.patch(

    "/api/admin/demandes-paiement/:id/refuser",

    adminAuth,

    refusePaymentRequest

);


/* ============================================================
   45. GESTION PREMIUM MANUELLE PAR ADMIN
============================================================ */

app.patch(
    "/api/admin/users/:id/premium",
    adminAuth,
    async function (req, res) {

        try {

            /* ====================================================
               ID UTILISATEUR
            ==================================================== */

            const id = parseId(
                req.params.id
            );

            if (!id) {

                return error(
                    res,
                    "ID utilisateur invalide.",
                    400
                );

            }


            /* ====================================================
               LECTURE DE LA DEMANDE
            ==================================================== */

            const body = req.body || {};


            /*
               Le frontend doit envoyer :

               {
                   enabled: true
               }

               ou

               {
                   enabled: false
               }

               On accepte aussi quelques anciennes formes
               pour éviter les problèmes de compatibilité.
            */

            let enabled;


            if (body.enabled !== undefined) {

                if (
                    body.enabled === true ||
                    body.enabled === 1 ||
                    body.enabled === "1" ||
                    String(body.enabled).toLowerCase() === "true"
                ) {

                    enabled = true;

                } else {

                    enabled = false;

                }

            }

            else if (body.premium !== undefined) {

                if (
                    body.premium === true ||
                    body.premium === 1 ||
                    body.premium === "1" ||
                    String(body.premium).toLowerCase() === "true"
                ) {

                    enabled = true;

                } else {

                    enabled = false;

                }

            }

            else if (body.is_premium !== undefined) {

                if (
                    body.is_premium === true ||
                    body.is_premium === 1 ||
                    body.is_premium === "1" ||
                    String(body.is_premium).toLowerCase() === "true"
                ) {

                    enabled = true;

                } else {

                    enabled = false;

                }

            }

            else {

                /*
                   Si aucun état n'est envoyé,
                   on considère l'action comme une activation.
                */

                enabled = true;

            }


            /* ====================================================
               DURÉE PREMIUM
            ==================================================== */

            let days = Number(
                body.days ??
                body.premium_days ??
                30
            );


            if (
                enabled &&
                (
                    !Number.isInteger(days) ||
                    days <= 0 ||
                    days > 3650
                )
            ) {

                return error(
                    res,
                    "Nombre de jours Premium invalide.",
                    400
                );

            }


            /* ====================================================
               VÉRIFICATION UTILISATEUR
            ==================================================== */

            const userResult =
                await pool.query(

                    `
                    SELECT
                        id,
                        nom,
                        email,
                        premium,
                        is_premium,
                        premium_until,
                        blocked,
                        is_blocked
                    FROM users
                    WHERE id=$1
                    LIMIT 1
                    `,

                    [id]

                );


            if (!userResult.rows.length) {

                return error(
                    res,
                    "Utilisateur introuvable.",
                    404
                );

            }


            const user =
                userResult.rows[0];


            /* ====================================================
               RETRAIT PREMIUM
            ==================================================== */

            if (!enabled) {

                const result =
                    await pool.query(

                        `
                        UPDATE users

                        SET
                            premium=false,
                            is_premium=false,
                            premium_until=NULL,
                            updated_at=CURRENT_TIMESTAMP

                        WHERE id=$1

                        RETURNING
                            id,
                            nom,
                            email,
                            premium,
                            is_premium,
                            premium_until
                        `,

                        [id]

                    );


                if (!result.rows.length) {

                    return error(
                        res,
                        "Utilisateur introuvable.",
                        404
                    );

                }


                await logActivity(

                    "DISABLE_PREMIUM",

                    `Premium désactivé pour l'utilisateur ${id}`,

                    id

                );


                return success(

                    res,

                    {
                        ...result.rows[0],
                        premium_days: 0
                    },

                    "Le statut Premium a été retiré."

                );

            }


            /* ====================================================
               ACTIVATION PREMIUM
            ==================================================== */

            const now =
                new Date();

            let baseDate =
                now;


            if (user.premium_until) {

                const currentUntil =
                    new Date(
                        user.premium_until
                    );


                if (
                    !isNaN(currentUntil.getTime()) &&
                    currentUntil > now
                ) {

                    baseDate =
                        currentUntil;

                }

            }


            const premiumUntil =
                new Date(baseDate);


            premiumUntil.setDate(
                premiumUntil.getDate() + days
            );


            /* ====================================================
               ACTIVATION
            ==================================================== */

            const result =
                await pool.query(

                    `
                    UPDATE users

                    SET
                        premium=true,
                        is_premium=true,
                        premium_until=$1,
                        updated_at=CURRENT_TIMESTAMP

                    WHERE id=$2

                    RETURNING
                        id,
                        nom,
                        email,
                        premium,
                        is_premium,
                        premium_until
                    `,

                    [
                        premiumUntil,
                        id
                    ]

                );


            if (!result.rows.length) {

                return error(
                    res,
                    "Utilisateur introuvable.",
                    404
                );

            }


            /* ====================================================
               JOURNAL ADMIN
            ==================================================== */

            await logActivity(

                "ENABLE_PREMIUM",

                `Premium activé pour l'utilisateur ${id} pendant ${days} jours`,

                id

            );


            /* ====================================================
               RÉPONSE
            ==================================================== */

            return success(

                res,

                {
                    ...result.rows[0],
                    premium_days: days
                },

                "Le statut Premium a été activé."

            );

        }

        catch (err) {

            console.error(
                "Erreur gestion Premium :",
                err
            );


            return error(

                res,

                "Impossible de modifier le statut Premium.",

                500,

                err.message

            );

        }

    }
);

/* ============================================================
   46. STATISTIQUES
============================================================ */

async function statistics(req, res) {

    try {

        const result =
            await pool.query(

                `
                SELECT

                    (
                        SELECT COUNT(*)
                        FROM users
                    )::int AS utilisateurs,

                    (
                        SELECT COUNT(*)
                        FROM users
                        WHERE premium=true
                           OR is_premium=true
                    )::int AS premium,

                    (
                        SELECT COUNT(*)
                        FROM users
                        WHERE blocked=true
                           OR is_blocked=true
                    )::int AS bloques,

                    (
                        SELECT COUNT(*)
                        FROM paiements
                    )::int AS paiements,

                    (
                        SELECT COUNT(*)
                        FROM paiements
                        WHERE LOWER(status)
                        IN (
                            'pending',
                            'en_attente',
                            'attente'
                        )
                    )::int AS en_attente,

                    (
                        SELECT COUNT(*)
                        FROM paiements
                        WHERE LOWER(status)
                        = 'validated'
                    )::int AS valides,

                    (
                        SELECT COUNT(*)
                        FROM paiements
                        WHERE LOWER(status)
                        = 'refused'
                    )::int AS refuses,

                    (
                        SELECT COUNT(*)
                        FROM demandes_paiement
                    )::int AS demandes_paiement,

                    (
                        SELECT COUNT(*)
                        FROM demandes_paiement
                        WHERE LOWER(
                            COALESCE(status,'pending')
                        )='pending'
                    )::int AS demandes_en_attente,

                    (
                        SELECT COUNT(*)
                        FROM demandes_paiement
                        WHERE LOWER(
                            COALESCE(status,'pending')
                        )='validated'
                    )::int AS demandes_validees,

                    (
                        SELECT COUNT(*)
                        FROM demandes_paiement
                        WHERE LOWER(
                            COALESCE(status,'pending')
                        )='refused'
                    )::int AS demandes_refusees,

                    (
                        SELECT COALESCE(
                            SUM(amount),
                            0
                        )
                        FROM paiements
                        WHERE LOWER(status)
                        = 'validated'
                    ) AS revenus

                `

            );


        const s =
            result.rows[0];


        return success(

            res,

            {

                utilisateurs:
                    Number(
                        s.utilisateurs
                    ),

                premium:
                    Number(
                        s.premium
                    ),

                bloques:
                    Number(
                        s.bloques
                    ),

                paiements:
                    Number(
                        s.paiements
                    ),

                en_attente:
                    Number(
                        s.en_attente
                    ),

                valides:
                    Number(
                        s.valides
                    ),

                refuses:
                    Number(
                        s.refuses
                    ),

                demandes_paiement:
                    Number(
                        s.demandes_paiement
                    ),

                demandes_en_attente:
                    Number(
                        s.demandes_en_attente
                    ),

                demandes_validees:
                    Number(
                        s.demandes_validees
                    ),

                demandes_refusees:
                    Number(
                        s.demandes_refusees
                    ),

                revenus:
                    s.revenus

            },

            "Statistiques chargées"

        );

    } catch (err) {

        return error(

            res,

            "Impossible de charger les statistiques.",

            500,

            err.message

        );

    }

}


app.get(

    "/api/admin/statistiques",

    adminAuth,

    statistics

);


app.get(

    "/api/statistiques",

    statistics

);


/* ============================================================
   47. ROUTE 404
============================================================ */

app.use(

    function(req, res) {

        return res.status(404).json({

            success: false,

            message:
                "Route introuvable.",

            method:
                req.method,

            path:
                req.originalUrl

        });

    }

);


/* ============================================================
   48. GESTIONNAIRE D'ERREURS
============================================================ */

app.use(

    function(err, req, res, next) {

        console.error(
            "Erreur serveur :",
            err
        );


        if (res.headersSent) {

            return next(err);

        }


        return res.status(500).json({

            success: false,

            message:
                "Erreur interne du serveur.",

            error:
                err.message

        });

    }

);


/* ============================================================
   49. ARRÊT PROPRE
============================================================ */

async function gracefulShutdown(signal) {

    console.log(

        `${signal} reçu. Arrêt du serveur...`

    );


    try {

        await pool.end();


        console.log(

            "Connexion PostgreSQL fermée."

        );


        process.exit(0);

    } catch (err) {

        console.error(

            "Erreur arrêt serveur :",

            err

        );


        process.exit(1);

    }

}


process.on(

    "SIGTERM",

    function() {

        gracefulShutdown(
            "SIGTERM"
        );

    }

);


process.on(

    "SIGINT",

    function() {

        gracefulShutdown(
            "SIGINT"
        );

    }

);


/* ============================================================
   50. DÉMARRAGE SERVEUR
============================================================ */

async function startServer() {

    try {

        await initDatabase();


        app.listen(

            PORT,

            "0.0.0.0",

            function() {

                console.log("");

                console.log(
                    "=================================================="
                );

                console.log(
                    "          BMJ SERVICE BACKEND"
                );

                console.log(
                    "          VERSION : 13.0.0"
                );

                console.log(
                    `          PORT : ${PORT}`
                );

                console.log(
                    "          DATABASE : PostgreSQL"
                );

                console.log(
                    "          SERVER : Render"
                );

                console.log(
                    "          STATUS : ONLINE"
                );

                console.log(
                    "=================================================="
                );

                console.log(
                    `ADMIN EMAIL : ${ADMIN_EMAIL}`
                );

                console.log(
                    "=================================================="
                );

                console.log(
                    `TOTAL ROUTES : ${ROUTES.length}`
                );

                console.log(
                    "=================================================="
                );

                console.log(
                    "NOUVELLE FONCTIONNALITÉ :"
                );

                console.log(
                    "POST /api/demandes-paiement"
                );

                console.log(
                    "TABLE : demandes_paiement"
                );

                console.log(
                    "=================================================="
                );

            }

        );

    } catch (err) {

        console.error("");

        console.error(
            "=================================================="
        );

        console.error(
            "IMPOSSIBLE DE DÉMARRER BMJ SERVICE"
        );

        console.error(
            "=================================================="
        );

        console.error(err);

        process.exit(1);

    }

}


startServer();