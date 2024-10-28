const express = require("express");
const axios = require("axios");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3");
const session = require("express-session");
const db = new sqlite3.Database("database.db");
const url = "https://api.spoonacular.com/";

const login = require("./keys.json");
const authenticate = require('./authentication.js');  

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(express.json());
app.set("view engine", "ejs");
app.set("views", __dirname + "/public");

app.use(session({
    secret: login.secret,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Home route: displays recipes based on ingredients in user's inventory
app.get("/", (req, res) => {
    const loggedIn = authenticate(req);
    const username = req.session ? req.session.username : null;

    if (!username) {
        return res.render("index", {
            isLoggedIn: loggedIn,
            breakfastRecipes: [],
            lunchRecipes: [],
            dinnerRecipes: [],
            message: null,
            error: null
        });
    }

    const query = `SELECT ingredient_name FROM ingredients WHERE username = ?`;

    db.all(query, [username], (err, rows) => {
        if (err) {
            return res.status(500).render("index", {
                isLoggedIn: loggedIn,
                username: username,
                breakfastRecipes: [],
                lunchRecipes: [],
                dinnerRecipes: [],
                message: null,
                error: "Error fetching ingredients."
            });
        }

        const userPantry = rows.map(row => row.ingredient_name.toLowerCase().trim());
        const appId = login.id;
        const appKey = login.key;

        const breakfastRequest = axios.get(url, {
            params: {
                q: userPantry.join(", "),
                app_id: appId,
                app_key: appKey,
                mealType: 'breakfast',
                from: 0,
                to: 10
            }
        });

        const lunchRequest = axios.get(url, {
            params: {
                q: userPantry.join(", "),
                app_id: appId,
                app_key: appKey,
                mealType: 'lunch',
                from: 0,
                to: 10
            }
        });

        const dinnerRequest = axios.get(url, {
            params: {
                q: userPantry.join(", "),
                app_id: appId,
                app_key: appKey,
                mealType: 'dinner',
                from: 0,
                to: 10
            }
        });

        Promise.all([breakfastRequest, lunchRequest, dinnerRequest])
            .then((responses) => {
                const breakfastRecipes = responses[0].data.hits.map(hit => {
                    const matchData = calculateRecipeMatch(hit.recipe.ingredientLines, userPantry);
                    return {
                        ...hit,
                        matchPercentage: matchData.matchPercentage,
                        missingIngredients: matchData.missingIngredients
                    };
                });

                const lunchRecipes = responses[1].data.hits.map(hit => {
                    const matchData = calculateRecipeMatch(hit.recipe.ingredientLines, userPantry);
                    return {
                        ...hit,
                        matchPercentage: matchData.matchPercentage,
                        missingIngredients: matchData.missingIngredients
                    };
                });

                const dinnerRecipes = responses[2].data.hits.map(hit => {
                    const matchData = calculateRecipeMatch(hit.recipe.ingredientLines, userPantry);
                    return {
                        ...hit,
                        matchPercentage: matchData.matchPercentage,
                        missingIngredients: matchData.missingIngredients
                    };
                });

                res.render("index", {
                    isLoggedIn: loggedIn,
                    username: username,
                    breakfastRecipes: breakfastRecipes,
                    lunchRecipes: lunchRecipes,
                    dinnerRecipes: dinnerRecipes,
                    message: null,
                    error: null
                });
            })
            .catch(error => {
                console.error(error);
                res.render("index", {
                    isLoggedIn: loggedIn,
                    username: username,
                    breakfastRecipes: [],
                    lunchRecipes: [],
                    dinnerRecipes: [],
                    message: null,
                    error: "Error fetching recipes from Edamam."
                });
            });
    });
});


// Search route: allows users to search for recipes
app.get("/search", (req, res) => {
    const loggedIn = authenticate(req);
    res.render("search", { 
        recipes: [],
        isLoggedIn: loggedIn,
        message: null,
        error: null
    });
});

app.post("/search", (req, res) => {
    const searchQuery = req.body.query;
    const loggedIn = authenticate(req);

    axios.get(url + "/recipes/complexSearch", {
        params: {
            query: searchQuery,
            api_key: login.key,
            number: 5
        }
    }).then(response => {
        const recipeData = response.data;

        if (recipeData.hits && recipeData.hits.length > 0) {
            console.log(recipeData.hits);
            res.render("search", { 
                recipes: recipeData.hits, 
                isLoggedIn: loggedIn,
                message: null, 
                error: null
            });
        } else {
            res.render("search", { 
                recipes: [],
                isLoggedIn: loggedIn,
                error: "No results found for your query.",
                message: null
            });
        }
    }).catch(error => {
        console.error(error);
        res.render("search", { 
            recipes: [],
            isLoggedIn: loggedIn,
            error: "An error occurred while processing your request. Please try again.",
            message: null
        });
    });
});

// Registration and login routes
app.get("/register", (req, res) => {
    const loggedIn = authenticate(req);
    res.render("register", { 
        isLoggedIn: loggedIn,
        error: null, 
        message: null
    });
});

// POST /register -> for registering users
app.post("/register", (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    const confirmPassword = req.body.confirm;
    const loggedIn = authenticate(req);
    
    if (!username || !password || !confirmPassword) {
        res.render("register", { 
            isLoggedIn: loggedIn,
            error: "All inputs are required", 
            message: null
        });
        return;
    }
    
    if (password == confirmPassword) {
        const saltRounds = 10;
        bcrypt.hash(password, saltRounds, (err, hashedPassword) => {
            if (err) {
                res.render("register", { 
                    isLoggedIn: loggedIn,
                    error: "Error hashing password", 
                    message: null
                });
                return;
            }
            
            db.run("CREATE TABLE IF NOT EXISTS logins(username TEXT NOT NULL UNIQUE, password TEXT NOT NULL)", (err) => {
                if (err) {
                    res.render("register", { 
                        isLoggedIn: loggedIn,
                        error: "Error creating table", 
                        message: null
                    });
                    return;
                }
                
                const query = "INSERT INTO logins (username, password) VALUES (?, ?)";
                db.run(query, [username, hashedPassword], function(err) {
                    if (err) {
                        if (err.code === 'SQLITE_CONSTRAINT') {
                            res.render("register", { 
                                isLoggedIn: loggedIn,
                                error: "Username already exists", 
                                message: null
                            });
                        } else {
                            res.render("register", { 
                                isLoggedIn: loggedIn,
                                error: "Error inserting user", 
                                message: null
                            });
                        }
                        return;
                    }
                    
                    const sessionID = req.sessionID || Math.random().toString(36).substring(2);
                    const expiry = Date.now() + (7 * 24 * 60 * 60 * 1000); // expires in 7 days (in milliseconds)
                    const sessionQuery = "INSERT INTO sessions (sessionID, username, expires) VALUES (?, ?, ?)";
                    
                    db.run(sessionQuery, [sessionID, username, expiry], (err) => {
                        if (err) {
                            res.render("register", { 
                                isLoggedIn: loggedIn,
                                error: "Error storing session", 
                                message: null
                            });
                            return;
                        }
                        req.session.username = username;
                        req.session.sessionID = sessionID;
                        req.session.isLoggedIn = true;
                        
                        res.render("index", { 
                            isLoggedIn: loggedIn,
                            error: null,
                            message: "User registered successfully"
                        });
                    });
                });
            });
        });
    } else {
        res.render("register", { 
            isLoggedIn: loggedIn,
            error: "Passwords do not match", 
            message: null
        });
    }
});

app.get("/login", (req, res) => {
    const loggedIn = authenticate(req);
    res.render("login", { 
        isLoggedIn: loggedIn,
        error: null, 
        message: null
    });
});

app.post("/login", (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    const loggedIn = authenticate(req);
    
    if (!username || !password) {
        return res.status(401).render("login", { 
            isLoggedIn: loggedIn,
            error: "Username and password are required", 
            message: null
        });
    }
    
    const query = "SELECT password FROM logins WHERE username = ?";
    db.get(query, [username], (err, row) => {
        if (err) {
            return res.status(401).render("login", { 
                isLoggedIn: loggedIn,
                error: "Error querying the database", 
                message: null
            });
        }
        
        if (!row) {
            return res.status(401).render("login", { 
                isLoggedIn: loggedIn,
                error: "Invalid username or password", 
                message: null
            });
        }
        
        bcrypt.compare(password, row.password, (err, result) => {
            if (err) {
                return res.status(500).render("login", { 
                    isLoggedIn: loggedIn,
                    error: "Error comparing passwords", 
                    message: null
                });
            }
            
            if (result) {
                const sessionID = req.sessionID || Math.random().toString(36).substring(2);
                const expiry = Date.now() + (7 * 24 * 60 * 60 * 1000); // expires in 7 days (in milliseconds)
                const sessionQuery = "INSERT INTO sessions (sessionID, username, expires) VALUES (?, ?, ?)";
                
                db.run(sessionQuery, [sessionID, username, expiry], (err) => {
                    if (err) {
                        return res.status(500).render("login", { 
                            isLoggedIn: loggedIn,
                            error: "Error storing session", 
                            message: null
                        });
                    }
                    req.session.username = username;
                    req.session.sessionID = sessionID;
                    req.session.isLoggedIn = true;
                    
                    res.render("index", { 
                        isLoggedIn: loggedIn,
                        error: null,
                        message: "Login successful"
                    });
                });
            } else {
                return res.status(401).render("login", { 
                    isLoggedIn: loggedIn,
                    error: "Invalid username or password", 
                    message: null
                });
            }
        });
    });
});

app.get("/logout", (req, res) => {
    const loggedIn = authenticate(req);
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).render("index", { 
                isLoggedIn: true,
                error: "Error logging out", 
                message: null
            });
        }
        res.render("index", { 
            isLoggedIn: false,
            error: null,
            message: "Logged out successfully!"
        });
    });
});

app.post("/search-ingredient", (req, res) => {
    const loggedIn = authenticate(req);

    if (!loggedIn || !req.session.username) {
        return res.status(401).render("login", { 
            isLoggedIn: loggedIn,
            error: null,
            message: null 
        });
    }

    const ingredientName = req.body.ingredient_name;
    
    axios.get(url + "ingredient/search", {
        params: {
            query: ingredientName,
            api_key: login.key,
            number: 5
        }
    }).then(responce => {
        const ingredientData = responce.data;
        
        if (ingredientData.hits && ingredientData.hits.length > 0) {
            res.render("ingredients")
        }
    })
});


app.post("/modify-ingredients", (req, res) => {
    const loggedIn = authenticate(req);

    if (!loggedIn || !req.session.username) {
        return res.status(401).render("login", { 
            isLoggedIn: false,
            error: null,
            message: null 
        });
    }

    const selectedIngredients = req.body.selectedIngredients;
    const action = req.body.action;

    if (!selectedIngredients || selectedIngredients.length === 0) {
        return res.render("ingredients", { 
            isLoggedIn: true,
            error: "No ingredients selected.", 
            message: null,
            ingredients: []
        });
    }

    if (action === "delete") {
        const placeholders = selectedIngredients.map(() => "?").join(",");
        const deleteQuery = `DELETE FROM ingredients WHERE id IN (${placeholders}) AND username = ?`;
        
        db.run(deleteQuery, [...selectedIngredients, req.session.username], (err) => {
            if (err) {
                return res.status(500).render("ingredients", { 
                    isLoggedIn: true,
                    error: "Error deleting ingredients.", 
                    message: null,
                    ingredients: []
                });
            }

            res.redirect("/ingredients");
        });
    }
    
    else if (action === "edit") {
        res.render("edit-ingredients", { 
            isLoggedIn: true,
            selectedIngredients: selectedIngredients,
            error: null,
            message: null
        });
    }
});


app.get("/ingredients", (req, res) => {
    const loggedIn = authenticate(req);

    if (!loggedIn || !req.session.username) {
        return res.status(401).render("login", { 
            isLoggedIn: false,
            error: null,
            message: null
        });
    }

    const username = req.session.username;

    const ingredientsQuery = "SELECT * FROM ingredients WHERE username = ?";
    db.all(ingredientsQuery, [username], (err, ingredients) => {
        if (err) {
            console.log(err);
            return res.status(500).render("ingredients", { 
                isLoggedIn: loggedIn,
                username: username,
                error: "Error retrieving ingredients.", 
                message: null,
                ingredients: []
            });
        }

        res.render("ingredients", { 
            isLoggedIn: loggedIn,
            username: username,
            error: null,
            message: null,
            ingredients: ingredients
        });
    });
});

app.get("/account", async (req, res) => {
    const blacklistedCodes = ["cd", "tw"];

    try {
        const loggedIn = authenticate(req);
        const response = await axios.get("https://backend.grocer.nz/stores");

        const filteredStores = response.data.filter(store => !blacklistedCodes.includes(store.vendor_code.toLowerCase()));

        res.render("accounts", {
            isLoggedIn: loggedIn,
            stores: filteredStores,
            error: null,
            message: null
        });
    } catch (err) {
        const loggedIn = authenticate(req);
        console.error(err);

        res.render("accounts", {
            isLoggedIn: loggedIn,
            stores: [],
            error: err
        });
    }
});


app.listen(727, () => {
    db.run("CREATE TABLE IF NOT EXISTS sessions (sessionID TEXT PRIMARY KEY, username TEXT NOT NULL, expires INTEGER NOT NULL)");
    db.run("CREATE TABLE IF NOT EXISTS logins (username TEXT NOT NULL UNIQUE, password TEXT NOT NULL)");
    db.run("CREATE TABLE IF NOT EXISTS ingredients (ingredient_name TEXT NOT NULL, quantity INTEGER NOT NULL, unit TEXT NOT NULL, username TEXT NOT NULL)")
    console.log("http://localhost:727");
});
