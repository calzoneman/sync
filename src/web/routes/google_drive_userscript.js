import { sendPug } from '../pug';

export default function initialize(app) {
    app.get('/google_drive_userscript', (req, res) => {
        return sendPug(res, 'google_drive_userscript');
    });
}
