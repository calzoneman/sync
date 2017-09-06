import { GET, POST, PATCH, DELETE } from '@calzoneman/express-babel-decorators';
import { CSRFError, InvalidRequestError } from '../../../errors';
import Promise from 'bluebird';

const LOGGER = require('@calzoneman/jsli')('AccountDataRoute');

function checkAcceptsJSON(req, res) {
    if (!req.accepts('application/json')) {
        res.status(406).send('Not Acceptable');

        return false;
    }

    return true;
}

async function authorize(req, res, csrfVerify, verifySessionAsync) {
    if (!req.signedCookies || !req.signedCookies.auth) {
        res.status(401).json({
            error: 'Authorization required'
        });

        return false;
    }

    try {
        csrfVerify(req);
    } catch (error) {
        if (error instanceof CSRFError) {
            res.status(403).json({
                error: 'Invalid CSRF token'
            });
        } else {
            LOGGER.error('CSRF check failed: %s', error.stack);
            res.status(503).json({ error: 'Internal error' });
        }

        return false;
    }

    try {
        const user = await verifySessionAsync(req.signedCookies.auth);

        if (user.name !== req.params.user) {
            res.status(403).json({
                error: 'Session username does not match'
            });

            return false;
        }
    } catch (error) {
        res.status(403).json({
            error: error.message
        });

        return false;
    }

    return true;
}

function reportError(req, res, error) {
    if (error instanceof InvalidRequestError) {
        res.status(400).json({ error: error.message });
    } else {
        LOGGER.error(
            '%s %s: %s',
            req.method,
            req.originalUrl,
            error.stack
        );
        res.status(503).json({ error: 'Internal error' });
    }

}

class AccountDataRoute {
    constructor(accountController, channelDB, csrfVerify, verifySessionAsync) {
        this.accountController = accountController;
        this.channelDB = channelDB;
        this.csrfVerify = csrfVerify;
        this.verifySessionAsync = verifySessionAsync;
    }

    @GET('/account/data/:user')
    async getAccount(req, res) {
        if (!checkAcceptsJSON(req, res)) return;
        if (!await authorize(req, res, this.csrfVerify, this.verifySessionAsync)) return;

        try {
            const user = await this.accountController.getAccount(req.params.user);

            res.status(user === null ? 404 : 200).json({ result: user });
        } catch (error) {
            reportError(req, res, error);
        }
    }

    @PATCH('/account/data/:user')
    async updateAccount(req, res) {
        if (!checkAcceptsJSON(req, res)) return;
        if (!await authorize(req, res, this.csrfVerify, this.verifySessionAsync)) return;

        const { password, updates } = req.body;

        try {
            await this.accountController.updateAccount(
                req.params.user,
                updates,
                password
            );
            res.status(204).send();
        } catch (error) {
            reportError(req, res, error);
        }
    }

    @GET('/account/data/:user/channels')
    async listChannels(req, res) {
        if (!checkAcceptsJSON(req, res)) return;
        if (!await authorize(req, res, this.csrfVerify, this.verifySessionAsync)) return;

        try {
            const channels = await this.channelDB.listByOwner(req.params.user).map(
                channel => ({
                    name: channel.name,
                    owner: channel.owner,
                    time: channel.time,
                    last_loaded: channel.last_loaded,
                    owner_last_seen: channel.owner_last_seen
                })
            );

            res.status(200).json({ result: channels });
        } catch (error) {
            reportError(req, res, error);
        }
    }

    @POST('/account/data/:user/channels/:name')
    async createChannel(req, res) {
        if (!checkAcceptsJSON(req, res)) return;
        if (!await authorize(req, res, this.csrfVerify, this.verifySessionAsync)) return;

        res.status(501).json({ error: 'Not implemented' });
    }

    @DELETE('/account/data/:user/channels/:name')
    async deleteChannel(req, res) {
        if (!checkAcceptsJSON(req, res)) return;
        if (!await authorize(req, res, this.csrfVerify, this.verifySessionAsync)) return;

        res.status(501).json({ error: 'Not implemented' });
    }
}

export { AccountDataRoute };
