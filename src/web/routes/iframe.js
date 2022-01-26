import { sendPug } from '../pug';

export default function initialize(app) {
    app.get('/iframe', (req, res) => {
        return sendPug(res, 'iframe');
    });
}
