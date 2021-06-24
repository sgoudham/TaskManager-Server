// Handle MongoDB connection logic

const mongoose = require('mongoose');
require('dotenv').config();

mongoose.Promise = global.Promise;

const username = process.env.MONGO_USERNAME;
const password = process.env.MONGO_PASS;
const host = process.env.SERVER_HOST;
const port = process.env.SERVER_PORT;

mongoose.connect(`mongodb://${username}:${password}@${host}:${port}/TaskManager?authSource=admin`, { useNewUrlParser: true, useUnifiedTopology: true }).then(() => {
    console.log("Connection Successful");
}).catch((exception) => {
    console.log("Connection Error");
    console.log(exception);
});

// Prevent Deprecation Warnings
mongoose.set('useCreateIndex', true);
mongoose.set('useFindAndModify', false);

module.exports = {
    mongoose
};