const mongoose = require('mongoose');
const _ = require('lodash');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// JWT Secret
const jwtSecret = process.env.JWT_SECRET;

const UserSchema = new mongoose.Schema({
    email: {
        type: String,
        minlength: 1,
        required: true,
        trim: true,
        unique: true
    },
    password: {
        type: String,
        required: true,
        minlength: 8
    },
    sessions: [{
        token: {
            type: String,
            required: true
        },
        expiresAt: {
            type: Number,
            required: true
        }
    }]
});

// Instance Methods
UserSchema.methods.toJSON = function() {
    const user = this;
    const userObject = user.toObject();

    // return the document except the password and sessions (these shouldn't be made available)
    return _.omit(userObject, ['password', 'sessions']);
}

UserSchema.methods.generateAccessAuthToken = function() {
    const user = this;
    return new Promise((resolve, reject) => {
        // Create JWT (JSON Web Token)
        jwt.sign({ _id: user._id.toHexString() }, jwtSecret, { expiresIn: "15m" }, (err, token) => {
            if (!err) {
                resolve(token);
            } else {
                reject();
            }
        });
    });
}

UserSchema.methods.generateRefreshAuthToken = function() {
    return new Promise((resolve) => {
        crypto.randomBytes(64, (err, buffer) => {
            if (!err) {
                let token = buffer.toString('hex');
                return resolve(token);
            }
        });
    });
}

UserSchema.methods.createSession = function() {
    let user = this;

    return user.generateRefreshAuthToken().then((refreshToken) => {
        return saveSessionToDatabase(user, refreshToken);
    }).then((refreshToken) => {
        return refreshToken;
    }).catch((e) => {
        return Promise.reject("Failed to Save Session To Database \n" + e);
    });
}

/* MODEL METHODS (static methods) */
UserSchema.statics.getJWTSecret = () => {
    return jwtSecret;
}

UserSchema.statics.findByIdAndToken = function (_id, token) {
    // finds user by id and token
    // used in auth middleware (verifySession)
    const User = this;

    return User.findOne({
        _id,
        'sessions.token': token
    });
}

UserSchema.statics.findByCredentials = function (email, password) {
    let User = this;
    return User.findOne({ email }).then((user) => {
        if (!user) return Promise.reject();

        return new Promise((resolve, reject) => {
            bcrypt.compare(password, user.password, (err, res) => {
                if (res) {
                    resolve(user);
                }
                else {
                    reject();
                }
            });
        });
    });
}

UserSchema.statics.hasRefreshTokenExpired = (expiresAt) => {
    let secondsSinceEpoch = Date.now() / 1000;
    return expiresAt <= secondsSinceEpoch;
}

/* MIDDLEWARE */
// Before a user document is saved, this code runs
UserSchema.pre('save', function (next) {
    let user = this;
    let costFactor = 10;

    if (user.isModified('password')) {
        // if the password field has been edited/changed then run this code.
        // Generate salt and hash password
        bcrypt.genSalt(costFactor, (err, salt) => {
            bcrypt.hash(user.password, salt, (err, hash) => {
                user.password = hash;
                next();
            });
        });
    } else {
        next();
    }
});

/* HELPER METHODS */
let saveSessionToDatabase = (user, refreshToken) => {
    return new Promise((resolve) => {
        let expiresAt = generateRefreshTokenExpiryTime();
        user.sessions.push({ 'token': refreshToken, expiresAt });
        
        user.save().then(() => {
            return resolve(refreshToken);
        }).catch((e) => {
            this.reject(e);
        });
    });
}

let generateRefreshTokenExpiryTime = () => {
    let daysUntilExpire = "10";
    let secondsUntilExpire = ((daysUntilExpire * 24) * 60) * 60;
    return ((Date.now() / 1000) + secondsUntilExpire);
}

const User = mongoose.model('User', UserSchema);

module.exports = { User }