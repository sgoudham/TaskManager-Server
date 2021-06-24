const express = require('express');
const app = express();
const { mongoose } = require('./db/mongoose');

/* MIDDLEWARE */
// Load Middleware
const jwt = require('jsonwebtoken');

app.use(express.json());

// CORS Headers
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS, PUT, PATCH, DELETE");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-access-token, x-refresh-token, _id");
    res.header('Access-Control-Expose-Headers', 'x-access-token, x-refresh-token');
    next();
});

// Check whether the request has a valid JWT access token
let authenticate = (req, res, next) => {
    let token = req.header('x-access-token');

    // Verify the JWT
    jwt.verify(token, User.getJWTSecret(), (err, decoded) => {
        if (err) {
            // Error occurred
            // JWT is invalid - *** DO NOT AUTHENTICATE ***
            res.status(401).send(err);
        } else {
            // JWT is valid
            req.user_id = decoded._id;
            next();
        }
    });
}

// Verify Refresh Token Middleware (which will be verifying the session)
let verifySession = (req, res, next) => {
    // grab the refresh token from the request header
    let refreshToken = req.header('x-refresh-token');

    // grab the _id from the request header
    let _id = req.header('_id');

    User.findByIdAndToken(_id, refreshToken).then((user) => {
        if (!user) {
            // user couldn't be found
            return Promise.reject({
                'error': 'User not found. Make sure that the Refresh Token and User Id are valid'
            });
        }

        // if the code reaches here - the user was found
        // therefore the refresh token exists in the database - but we still have to check if it has expired or not

        req.user_id = user._id;
        req.userObject = user;
        req.refreshToken = refreshToken;

        let isSessionValid = false;

        user.sessions.forEach((session) => {
            if (session.token === refreshToken) {
                // check if the session has expired
                if (User.hasRefreshTokenExpired(session.expiresAt) === false) {
                    // refresh token has not expired
                    isSessionValid = true;
                }
            }
        });

        if (isSessionValid) {
            // the session is VALID - call next() to continue with processing this web request
            next();
        } else {
            // the session is not valid
            return Promise.reject({
                'error': 'Refresh Token has Expired or the Session is Invalid'
            });
        }
    }).catch((e) => {
        res.status(401).send(e);
    });
}

/* MONGOOSE MODELS */
const { List, Task, User } = require('./db/models');

/* ROUTE HANDLERS */

/* LIST ROUTES */

/**
 * GET /lists
 * Purpose: Get all lists
 */
app.get('/lists', authenticate, (req, res) => {
    // Return array of lists in the database that belong to the authenticate user
    List.find({
        _userId: req.user_id
    }).then((lists) => {
        res.send(lists);
    });
});

/**
 * POST /lists
 * Purpose: Create a list
 */
app.post('/lists', authenticate, (req, res) => {
    // Create new list & return new list back to the user (including id)
    // List information will be passed in through the JSON request body
    let title = req.body.title;

    let newList = new List({
        title,
        _userId: req.user_id
    });
    newList.save().then((listDocument) => {
        // Full List Document Is Returned 
        res.send(listDocument);
    });
});

/**
 * PATCH /lists/:id
 * Purpose: Update specified list
 */
app.patch('/lists/:id', authenticate, (req, res) => {
    // Update the specified list with the new values specified in the JSON request body
    List.findOneAndUpdate({ _id: req.params.id, _userId: req.user_id }, {
        $set: req.body
    }).then(() => {
        res.sendStatus(200);
    });
});

/**
 * DELETE /lists/:id
 * Purpose: Delete specified list
 */
app.delete('/lists/:id', authenticate, (req, res) => {
    // Delete specified list
    List.findOneAndRemove({
        _id: req.params.id,
        _userId: req.user_id
    }).then((removedListDocument) => {
        res.send(removedListDocument);

        // Delete All Tasks Within Deleted List
        deleteTasksFromList(removedListDocument._id);
    });
});

/**
 * GET /lists/:listId/tasks
 * Purpose: Get all tasks within specific list
 */
app.get('/lists/:listId/tasks', authenticate, (req, res) => {
    // Return tasks that belong to a specific list
    Task.find({
        _listId: req.params.listId
    }).then((tasks) => {
        res.send(tasks);
    });
});

/**
 * GET /lists/:listId/tasks/:taskId
 * Purpose: Retrieve specific task from specific list
 */
app.get('/lists/:listId/tasks/:taskId', authenticate, (req, res) => {
    Task.findOne({
        _id: req.params.taskId,
        _listId: req.params.listId
    }).then((task) => {
        res.send(task);
    });
});

/**
 * POST /lists/:listId/tasks
 * Purpose: Create a new task in a specific list
 */
app.post('/lists/:listId/tasks', authenticate, (req, res) => {
    // Create a new task in a list specified by listId

    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) => {
        return !!list;
    }).then((canCreateTask) => {
        if (canCreateTask) {
            let newTask = new Task({
                title: req.body.title,
                _listId: req.params.listId
            });
            newTask.save().then((newTaskDocument) => {
                res.send(newTaskDocument);
            });
        } else {
            res.sendStatus(404);
        }
    });
});

/**
 * PATCH /lists/:listId/tasks/:taskId
 * Purpose: Update an existing task
 */
app.patch('/lists/:listId/tasks/:taskId', authenticate, (req, res) => {
    // Update an existing task specified by taskId

    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) => {
        return !!list;
    }).then((canUpdateTask) => {
        if (canUpdateTask) {
            Task.findOneAndUpdate({
                _id: req.params.taskId,
                _listId: req.params.listId
            }, {
                $set: req.body
            }).then(() => {
                res.send({ message: "Updated Successfully" });
            });
        } else {
            res.sendStatus(404);
        }
    });
});

/**
* DELETE /lists/:listId/tasks/:taskId
* Purpose: Delete a task
*/
app.delete('/lists/:listId/tasks/:taskId', authenticate, (req, res) => {
    // Delete a task specified by taskId

    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) => {
        return !!list;
    }).then((canDeleteTask) => {
        if (canDeleteTask) {
            Task.findOneAndRemove({
                _id: req.params.taskId,
                _listId: req.params.listId
            }).then((removedTaskDocument) => {
                res.send(removedTaskDocument);
            });
        } else {
            res.sendStatus(404);
        }
    });
});

/* USER ROUTES */

/**
 * POST /users
 * Purpose: Sign up
 */
app.post('/users', (req, res) => {
    // User sign up
    let body = req.body;
    let newUser = new User(body);

    newUser.save().then(() => {
        return newUser.createSession();
    }).then((refreshToken) => {
        // Session created successfully - refreshToken returned.
        // now we geneate an access auth token for the user

        return newUser.generateAccessAuthToken().then((accessToken) => {
            // access auth token generated successfully, now we return an object containing the auth tokens
            return { accessToken, refreshToken }
        });
    }).then((authTokens) => {
        // Now we construct and send the response to the user with their auth tokens in the header and the user object in the body
        res
            .header('x-refresh-token', authTokens.refreshToken)
            .header('x-access-token', authTokens.accessToken)
            .send(newUser);
    }).catch((e) => {
        res.status(400).send(e);
    });
})

/**
 * POST /users/login
 * Purpose: Login
 */
app.post('/users/login', (req, res) => {
    let email = req.body.email;
    let password = req.body.password;

    User.findByCredentials(email, password).then((user) => {
        return user.createSession().then((refreshToken) => {
            // Session created successfully - refreshToken returned.
            // now we geneate an access auth token for the user

            return user.generateAccessAuthToken().then((accessToken) => {
                // access auth token generated successfully, now we return an object containing the auth tokens
                return { accessToken, refreshToken }
            });
        }).then((authTokens) => {
            // Now we construct and send the response to the user with their auth tokens in the header and the user object in the body
            res
                .header('x-refresh-token', authTokens.refreshToken)
                .header('x-access-token', authTokens.accessToken)
                .send(user);
        })
    }).catch((e) => {
        res.status(400).send(e);
    });
})

/**
 * GET /users/me/access-token
 * Purpose: generates and returns an access token
 */
 app.get('/users/me/access-token', verifySession, (req, res) => {
    // we know that the user/caller is authenticated and we have the user_id and user object available to us
    req.userObject.generateAccessAuthToken().then((accessToken) => {
        res.header('x-access-token', accessToken).send({ accessToken });
    }).catch((e) => {
        res.status(400).send(e);
    });
})

/* HELPER METHODS */
let deleteTasksFromList = (_listId) => {
    Task.deleteMany({
        _listId
    }).then(() => {
        console.log("Tasks from " + _listId + " were deleted!");
    })
}


app.listen(3000, () => {
    console.log("Server is listening on port 3000")
});
