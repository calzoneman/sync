import CyTubeUtil from '../../utilities';
import { sendJade } from '../jade';

export default function initialize(app, webConfig) {
    app.get('/contact', (req, res) => {
        // Basic obfuscation of email addresses to prevent spambots
        // from picking them up.  Not real encryption.
        // Deobfuscated by clientside JS.
        const contacts = webConfig.getEmailContacts().map(contact => {
            const emkey = CyTubeUtil.randomSalt(16);
            let email = new Array(contact.email.length);
            for (let i = 0; i < contact.email.length; i++) {
                email[i] = String.fromCharCode(
                    contact.email.charCodeAt(i) ^ emkey.charCodeAt(i % emkey.length)
                );
            }
            contact.email = escape(email.join(""));
            contact.emkey = escape(emkey);
            return contact;
        });

        return sendJade(res, 'contact', {
            contacts: contacts
        });
    });
}
