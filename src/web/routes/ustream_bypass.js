import { HTTPError } from '../../errors';
import * as HTTPStatus from '../httpstatus';
import https from 'https';
import Promise from 'bluebird';

const INJECTION = `
<head>
  <style type="text/css">
    #PlayerOne.ui-enabled #ScreensContainer.shown {
      display: none !important;
    }
  </style>`;

function ustreamSucks(channelId) {
    const url = `https://www.ustream.tv/embed/${channelId}`;
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            if (res.statusCode !== HTTPStatus.OK) {
                res.resume();
                return reject(new HTTPError(res.statusMessage, { status: res.statusCode }));
            }

            res.setEncoding('utf8');
            let buffer = '';
            res.on('data', data => buffer += data);
            res.on('end', () => {
                buffer = buffer.replace(/<head>/, INJECTION);
                resolve(buffer);
            });
        });

        req.on('error', error => {
            reject(error);
        });
    });
}

export default function initialize(app) {
    app.get('/ustream_bypass/embed/:channelId', (req, res) => {
        if (!req.params.channelId || !/^\d+$/.test(req.params.channelId)) {
            throw new HTTPError(`Invalid channel ID "${req.params.channelId}".`, {
                status: HTTPStatus.BAD_REQUEST
            });
        }

        ustreamSucks(req.params.channelId).then(buffer => {
            res.type('html').send(buffer);
        }).catch(HTTPError, error => {
            res.status(error.status).send(error.message);
        }).catch(error => {
            res.status(HTTPStatus.INTERNAL_SERVER_ERROR).send('Internal Server Error');
        });
    });
};
