const mongoose = require('mongoose');

const DEFAULT_LOCAL_URI = 'mongodb://127.0.0.1:27017/wordclash';
const MONGO_URI = process.env.MONGODB_URI || DEFAULT_LOCAL_URI;
const MONGO_DISABLED = process.env.MONGODB_DISABLED === 'true';

let connectPromise = null;

function isMongoReady() {
  return mongoose.connection.readyState === 1;
}

async function connectMongo() {
  if (MONGO_DISABLED) {
    console.warn('[mongo] disabled by MONGODB_DISABLED=true');
    return false;
  }

  if (isMongoReady()) return true;
  if (connectPromise) return connectPromise;

  connectPromise = mongoose
    .connect(MONGO_URI, {
      serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000),
      maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || 20),
      minPoolSize: Number(process.env.MONGODB_MIN_POOL_SIZE || 2),
      autoIndex: true,
    })
    .then(() => {
      console.log(`[mongo] connected (${mongoose.connection.name})`);
      return true;
    })
    .catch((error) => {
      console.error('[mongo] connection failed:', error.message);
      return false;
    })
    .finally(() => {
      connectPromise = null;
    });

  return connectPromise;
}

module.exports = {
  connectMongo,
  isMongoReady,
};
