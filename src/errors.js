import createError from 'create-error';
import * as HTTPStatus from './web/httpstatus';

export const ChannelStateSizeError = createError('ChannelStateSizeError');
export const ChannelNotFoundError = createError('ChannelNotFoundError');
export const CSRFError = createError('CSRFError');
export const HTTPError = createError('HTTPError', {
    status: HTTPStatus.INTERNAL_SERVER_ERROR
});
