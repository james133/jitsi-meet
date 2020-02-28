// @flow

import { toState } from '../base/redux';

/**
 * Returns true if the filmstrip on mobile is visible, false otherwise.
 *
 * NOTE: Filmstrip on mobile behaves differently to web, and is only visible
 * when there are at least 2 participants.
 *
 * @param {Object | Function} stateful - The Object or Function that can be
 * resolved to a Redux state object with the toState function.
 * @returns {boolean}
 */
export function isFilmstripVisible(stateful: Object | Function) {
    const state = toState(stateful);
    const { length: participantCount } = state['features/base/participants'];

    return participantCount > 1;
}
/**
 * Determines whether the remote video thumbnails should be displayed/visible in
 * the filmstrip.
 *
 * @param {Object} state - The full redux state.
 * @returns {boolean} - If remote video thumbnails should be displayed/visible
 * in the filmstrip, then {@code true}; otherwise, {@code false}.
 */
export function isRemoteVideoHide(stateful: Object | Function) {
    const state = toState(stateful);
    const { length: participantCount } = state['features/base/participants'];

    return participantCount <= 2;
}