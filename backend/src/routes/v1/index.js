const express = require('express');
const authRoute = require('./auth.route');
const userRoute = require('./user.route');
const databaseRoute = require('./database.route');
const backupRoute = require('./backup.route');
const notificationRoute = require('./notification.route');
const cloudStorageRoute = require('./cloudStorage.route');
const agentRoute = require('./agent.route');
const docsRoute = require('./docs.route');
const config = require('../../config/config');

const router = express.Router();

const defaultRoutes = [
  {
    path: '/auth',
    route: authRoute,
  },
  {
    path: '/users',
    route: userRoute,
  },
  {
    path: '/databases',
    route: databaseRoute,
  },
  {
    path: '/backups',
    route: backupRoute,
  },
  {
    path: '/notifications',
    route: notificationRoute,
  },
  {
    path: '/cloud-storage',
    route: cloudStorageRoute,
  },
  {
    path: '/agents',
    route: agentRoute,
  },
];

const devRoutes = [
  // routes available only in development mode
  {
    path: '/docs',
    route: docsRoute,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

/* istanbul ignore next */
if (config.env === 'development') {
  devRoutes.forEach((route) => {
    router.use(route.path, route.route);
  });
}

module.exports = router;
