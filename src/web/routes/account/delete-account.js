import { sendPug } from '../../pug';
import Config from '../../../config';
import { eventlog } from '../../../logger';
const verifySessionAsync = require('bluebird').promisify(
    require('../../../session').verifySession
);

const LOGGER = require('@calzoneman/jsli')('web/routes/account/delete-account');

export default function initialize(
    app,
    csrfVerify,
    channelDb,
    userDb,
    emailConfig,
    emailController
) {
    app.get('/account/delete', async (req, res) => {
        if (!await authorize(req, res)) {
            return;
        }

        await showDeletePage(res, {});
    });

    app.post('/account/delete', async (req, res) => {
        if (!await authorize(req, res)) {
            return;
        }

        csrfVerify(req);

        if (!req.body.confirmed) {
            await showDeletePage(res, { missingConfirmation: true });
            return;
        }

        let user;
        try {
            user = await userDb.verifyLoginAsync(res.locals.loginName, req.body.password);
        } catch (error) {
            if (error.message === 'Invalid username/password combination') {
                res.status(403);
                await showDeletePage(res, { wrongPassword: true });
            } else if (error.message === 'User does not exist' ||
                       error.message.match(/Invalid username/)) {
                LOGGER.error('User does not exist after authorization');
                res.status(503);
                await showDeletePage(res, { internalError: true });
            } else {
                res.status(503);
                LOGGER.error('Unknown error in verifyLogin: %s', error.stack);
                await showDeletePage(res, { internalError: true });
            }
            return;
        }

        try {
            let channels = await channelDb.listUserChannelsAsync(user.name);
            if (channels.length > 0) {
                await showDeletePage(res, { channelCount: channels.length });
                return;
            }
        } catch (error) {
            LOGGER.error('Unknown error in listUserChannels: %s', error.stack);
            await showDeletePage(res, { internalError: true });
        }

        try {
            await userDb.requestAccountDeletion(user.id);
            eventlog.log(`[account] ${req.realIP} requested account deletion for ${user.name}`);
        } catch (error) {
            LOGGER.error('Unknown error in requestAccountDeletion: %s', error.stack);
            await showDeletePage(res, { internalError: true });
        }

        if (emailConfig.getDeleteAccount().isEnabled() && user.email) {
            await sendEmail(user);
        } else {
            LOGGER.warn(
                'Skipping account deletion email notification for %s',
                user.name
            );
        }

        res.clearCookie('auth', { domain: Config.get('http.root-domain-dotted') });
        res.locals.loggedIn = false;
        res.locals.loginName = null;
        sendPug(
            res,
            'account-deleted',
            {}
        );
    });

    async function showDeletePage(res, flags) {
        let locals = Object.assign({ channelCount: 0 }, flags);

        if (res.locals.loggedIn) {
            let channels = await channelDb.listUserChannelsAsync(
                res.locals.loginName
            );
            locals.channelCount = channels.length;
        } else {
            res.status(401);
        }

        sendPug(
            res,
            'account-delete',
            locals
        );
    }

    async function authorize(req, res) {
        try {
            if (!res.locals.loggedIn) {
                res.status(401);
                await showDeletePage(res, {});
                return;
            }

            if (!req.signedCookies || !req.signedCookies.auth) {
                throw new Error('Missing auth cookie');
            }

            await verifySessionAsync(req.signedCookies.auth);
            return true;
        } catch (error) {
            res.status(401);
            sendPug(
                res,
                'account-delete',
                { authFailed: true, reason: error.message }
            );
            return false;
        }
    }

    async function sendEmail(user) {
        LOGGER.info(
            'Sending email notification for account deletion %s <%s>',
            user.name,
            user.email
        );

        try {
            await emailController.sendAccountDeletion({
                username: user.name,
                address: user.email
            });
        } catch (error) {
            LOGGER.error(
                'Sending email notification failed for %s <%s>: %s',
                user.name,
                user.email,
                error.stack
            );
        }
    }
}
