import { InvalidRequestError } from '../errors';
import { isValidEmail } from '../utilities';
import { parse as parseURL } from 'url';
import bcrypt from 'bcrypt';
import Promise from 'bluebird';

Promise.promisifyAll(bcrypt);

class AccountController {
    constructor(accountDB, globalMessageBus) {
        this.accountDB = accountDB;
        this.globalMessageBus = globalMessageBus;
    }

    async getAccount(name) {
        const user = await this.accountDB.getByName(name);

        if (user) {
            return {
                name: user.name,
                email: user.email,
                profile: user.profile,
                time: user.time
            };
        } else {
            return null;
        }
    }

    async updateAccount(name, updates, password = null) {
        let requirePassword = false;
        const fields = {};

        if (!updates || updates.toString() !== '[object Object]') {
            throw new InvalidRequestError('Malformed input');
        }

        if (updates.email) {
            if (!isValidEmail(updates.email)) {
                throw new InvalidRequestError('Invalid email address');
            }

            fields.email = updates.email;
            requirePassword = true;
        }

        if (requirePassword) {
            if (!password) {
                throw new InvalidRequestError('Password required');
            }

            const user = await this.accountDB.getByName(name);

            if (!user) {
                throw new InvalidRequestError('User does not exist');
            }

            // For legacy reasons, the password was truncated to 100 chars.
            password = password.substring(0, 100);

            if (!await bcrypt.compareAsync(password, user.password)) {
                throw new InvalidRequestError('Invalid password');
            }
        }

        await this.accountDB.updateByName(name, fields);
    }
}

export { AccountController };
