// @flow
import { DeviceEventEmitter, Alert } from 'react-native';
import { NativeEventEmitter, NativeModules } from 'react-native';
import { assign, ReducerRegistry, MiddlewareRegistry } from '../../base/redux';
import {
    CONFERENCE_FAILED,
    CONFERENCE_JOINED,
    CONFERENCE_LEFT,
    CONFERENCE_WILL_JOIN,
    JITSI_CONFERENCE_URL_KEY,
    SET_ROOM,
    forEachConference,
    isRoomValid,
    getConferenceName,
    getCurrentConference,
    LARGEVIDEO_ON_CLICK,
    THNUMBNAILVIDEO_ON_CLICK,
    LOCALVIDEO_ON_CLICK,
    COMMON_CALLBACK_ENENT
} from '../../base/conference';
import { LOAD_CONFIG_ERROR } from '../../base/config';
import {
    CONNECTION_DISCONNECTED,
    CONNECTION_FAILED,
    JITSI_CONNECTION_CONFERENCE_KEY,
    JITSI_CONNECTION_URL_KEY,
    getURLWithoutParams
} from '../../base/connection';
import { ENTER_PICTURE_IN_PICTURE } from '../picture-in-picture';

import { sendEvent } from './functions';
import { APP_WILL_MOUNT, APP_WILL_UNMOUNT } from '../../base/app';
import { createTrackMutedEvent, sendAnalytics } from '../../analytics';
import { appNavigate } from '../../app';
import { SET_AUDIO_ONLY } from '../../base/audio-only';
const { AudioMode } = NativeModules;
import { getLocalVideoType, isLocalVideoTrackMuted } from '../../base/tracks';
import { setAudioOnly } from '../../base/audio-only';
import {
    MEDIA_TYPE,
    isVideoMutedByAudioOnly,
    VIDEO_MUTISM_AUTHORITY,
    setAudioMuted,
    setVideoMuted,
    toggleCameraFacingMode
} from '../../base/media';
/**
 * Event which will be emitted on the native side to indicate the conference
 * has ended either by user request or because an error was produced.
 */
const CONFERENCE_TERMINATED = 'CONFERENCE_TERMINATED';
const logger = require('jitsi-meet-logger').getLogger(__filename);


let ExternalAPI = NativeModules.ExternalAPI;

// XXX Rather than wrapping ConnectionService in a new class and forwarding
// the many methods of the latter to the former, add the one additional
// method that we need to ConnectionService.
if (ExternalAPI) {
    const eventEmitter = new NativeEventEmitter(ExternalAPI);

    ExternalAPI = {
        ...ExternalAPI,
        addListener: eventEmitter.addListener.bind(eventEmitter),
        registerSubscriptions(context, delegate) {
            logger.debug('registerSubscriptions');
            
            return [
                ExternalAPI.addListener(
                    'org.jitsi.meet:features/connection_service#disconnect',
                    delegate._onPerformEndCallAction,
                    context),
                ExternalAPI.addListener(
                    'org.jitsi.meet:features/connection_service#abort',
                    delegate._onPerformEndCallAction,
                    context),
                ExternalAPI.addListener(
                    'performEndCallAction',
                     delegate._onPerformEndCallAction,
                    context),
                ExternalAPI.addListener(
                    'performToggleLocalVideoAction',
                    delegate._onPerformSetToggleLocalVideoAction,
                    context),
                ExternalAPI.addListener(
                    'performToggleCameraFacingModeAction',
                    delegate._onPerformToggleCameraFacingModeAction,
                    context),
                ExternalAPI.addListener(
                    'performSpeakerModePhoneAction',
                    delegate._onPerformSpeakerModePhoneAction,
                    context),
                ExternalAPI.addListener(
                    'performSpeakerModeSpeakerAction',
                    delegate._onPerformSpeakerModeSpeakerAction,
                    context),
                ExternalAPI.addListener(
                    'performSetMutedCallAction',
                    delegate._onPerformSetMutedCallAction,
                    context)
                    
            ];
        },
        setMuted() {
            // Currently no-op, but remember to remove when implemented on
            // the native side
            // APP.UI.emitEvent(UIEvents.ETHERPAD_CLICKED);
        }
    };
}


/**
 * Notifies the feature callkit that the action {@link APP_WILL_MOUNT} is being
 * dispatched within a specific redux {@code store}.
 *
 * @param {Store} store - The redux store in which the specified {@code action}
 * is being dispatched.
 * @param {Dispatch} next - The redux {@code dispatch} function to dispatch the
 * specified {@code action} in the specified {@code store}.
 * @param {Action} action - The redux action {@code APP_WILL_MOUNT} which is
 * being dispatched in the specified {@code store}.
 * @private
 * @returns {*} The value returned by {@code next(action)}.
 */
function _appWillMount({ dispatch, getState }, next, action) {
    const result = next(action);

    const context = {
        dispatch,
        getState
    };

    const delegate = {
        _onPerformSetMutedCallAction,
        _onPerformEndCallAction,
        _onPerformSetToggleLocalVideoAction,
        _onPerformToggleCameraFacingModeAction,
        _onPerformSpeakerModePhoneAction,
        _onPerformSpeakerModeSpeakerAction
    };

    const subscriptions
        = ExternalAPI.registerSubscriptions(context, delegate);

    subscriptions && dispatch({
        type: '_SET_EXTERNAL_API_SUBSCRIPTIONS',
        subscriptions
    });

    // logger.debug("_appWillMount");
    // Alert.alert('external-api _appWillMount');
    return result;
}


(ExternalAPI) && ReducerRegistry.register(
    'features/external-api',
    (state = {}, action) => {
        switch (action.type) {
        case '_SET_EXTERNAL_API_SUBSCRIPTIONS':
            return assign(state, 'subscriptions', action.subscriptions);
        }

        return state;
    });


/**
 * Notifies the feature callkit that the action
 * {@link _SET_EXTERNAL_API_SUBSCRIPTIONS} is being dispatched within
 * a specific redux {@code store}.
 *
 * @param {Store} store - The redux store in which the specified {@code action}
 * is being dispatched.
 * @param {Dispatch} next - The redux {@code dispatch} function to dispatch the
 * specified {@code action} in the specified {@code store}.
 * @param {Action} action - The redux action
 * {@code _SET_EXTERNAL_API_SUBSCRIPTIONS} which is being dispatched in
 * the specified {@code store}.
 * @private
 * @returns {*} The value returned by {@code next(action)}.
 */
function _setExternalApiSubscriptions({ getState }, next, action) {
    const { subscriptions } = getState()['features/external-api'];

    if (subscriptions) {
        for (const subscription of subscriptions) {
            subscription.remove();
        }
    }

    return next(action);
}

/**
 * Middleware that captures Redux actions and uses the ExternalAPI module to
 * turn them into native events so the application knows about them.
 *
 * @param {Store} store - Redux store.
 * @returns {Function}
 */
MiddlewareRegistry.register(store => next => action => {
    const result = next(action);
    const { type } = action;
    
    switch (type) {
    case '_SET_EXTERNAL_API_SUBSCRIPTIONS':
        return _setExternalApiSubscriptions(store, next, action);
    
    case APP_WILL_MOUNT:
        return _appWillMount(store, next, action);
    
    case APP_WILL_UNMOUNT:
        store.dispatch({
            type: '_SET_EXTERNAL_API_SUBSCRIPTIONS',
            subscriptions: undefined
        });
        break;
    case CONFERENCE_FAILED: {
        const { error, ...data } = action;

        // XXX Certain CONFERENCE_FAILED errors are recoverable i.e. they have
        // prevented the user from joining a specific conference but the app may
        // be able to eventually join the conference. For example, the app will
        // ask the user for a password upon
        // JitsiConferenceErrors.PASSWORD_REQUIRED and will retry joining the
        // conference afterwards. Such errors are to not reach the native
        // counterpart of the External API (or at least not in the
        // fatality/finality semantics attributed to
        // conferenceFailed:/onConferenceFailed).
        if (!error.recoverable) {
            _sendConferenceEvent(store, /* action */ {
                error: _toErrorString(error),
                ...data
            });
        }
        break;
    }
    case LARGEVIDEO_ON_CLICK:
        _sendConferenceEvent(store, action);
        break;
    case THNUMBNAILVIDEO_ON_CLICK:
        _sendConferenceEvent(store, action);
        break;
    case LOCALVIDEO_ON_CLICK:
        _sendConferenceEvent(store, action);
        break;
    case COMMON_CALLBACK_ENENT:
        _sendConferenceEvent(store, action);
        break;
    case CONFERENCE_JOINED:
    case CONFERENCE_LEFT:
    case CONFERENCE_WILL_JOIN:
        _sendConferenceEvent(store, action);
        
        break;

    case CONNECTION_DISCONNECTED: {
        // FIXME: This is a hack. See the description in the JITSI_CONNECTION_CONFERENCE_KEY constant definition.
        // Check if this connection was attached to any conference. If it wasn't, fake a CONFERENCE_TERMINATED event.
        const { connection } = action;
        const conference = connection[JITSI_CONNECTION_CONFERENCE_KEY];

        if (!conference) {
            // This action will arrive late, so the locationURL stored on the state is no longer valid.
            const locationURL = connection[JITSI_CONNECTION_URL_KEY];

            sendEvent(
                store,
                CONFERENCE_TERMINATED,
                /* data */ {
                    url: _normalizeUrl(locationURL)
                });
        }

        break;
    }

    case CONNECTION_FAILED:
        !action.error.recoverable
            && _sendConferenceFailedOnConnectionError(store, action);
        break;

    case ENTER_PICTURE_IN_PICTURE:
        sendEvent(store, type, /* data */ {});
        break;

    case LOAD_CONFIG_ERROR: {
        const { error, locationURL } = action;

        sendEvent(
            store,
            CONFERENCE_TERMINATED,
            /* data */ {
                error: _toErrorString(error),
                url: _normalizeUrl(locationURL)
            });
        break;
    }

    case SET_ROOM:
        _maybeTriggerEarlyConferenceWillJoin(store, action);
        break;
    }

    return result;
});

/**
 * Returns a {@code String} representation of a specific error {@code Object}.
 *
 * @param {Error|Object|string} error - The error {@code Object} to return a
 * {@code String} representation of.
 * @returns {string} A {@code String} representation of the specified
 * {@code error}.
 */
function _toErrorString(
        error: Error | { message: ?string, name: ?string } | string) {
    // XXX In lib-jitsi-meet and jitsi-meet we utilize errors in the form of
    // strings, Error instances, and plain objects which resemble Error.
    return (
        error
            ? typeof error === 'string'
                ? error
                : Error.prototype.toString.apply(error)
            : '');
}

/**
 * If {@link SET_ROOM} action happens for a valid conference room this method
 * will emit an early {@link CONFERENCE_WILL_JOIN} event to let the external API
 * know that a conference is being joined. Before that happens a connection must
 * be created and only then base/conference feature would emit
 * {@link CONFERENCE_WILL_JOIN}. That is fine for the Jitsi Meet app, because
 * that's the a conference instance gets created, but it's too late for
 * the external API to learn that. The latter {@link CONFERENCE_WILL_JOIN} is
 * swallowed in {@link _swallowEvent}.
 *
 * @param {Store} store - The redux store.
 * @param {Action} action - The redux action.
 * @returns {void}
 */
function _maybeTriggerEarlyConferenceWillJoin(store, action) {
    const { locationURL } = store.getState()['features/base/connection'];
    const { room } = action;

    isRoomValid(room) && locationURL && sendEvent(
        store,
        CONFERENCE_WILL_JOIN,
        /* data */ {
            url: _normalizeUrl(locationURL)
        });
}

/**
 * Normalizes the given URL for presentation over the external API.
 *
 * @param {URL} url -The URL to normalize.
 * @returns {string} - The normalized URL as a string.
 */
function _normalizeUrl(url: URL) {
    return getURLWithoutParams(url).href;
}

/**
 * Sends an event to the native counterpart of the External API for a specific
 * conference-related redux action.
 *
 * @param {Store} store - The redux store.
 * @param {Action} action - The redux action.
 * @returns {void}
 */
function _sendConferenceEvent(
        store: Object,
        action: {
            conference: Object,
            type: string,
            url: ?string
        }) {
    const { conference, type, ...data } = action;

    // For these (redux) actions, conference identifies a JitsiConference
    // instance. The external API cannot transport such an object so we have to
    // transport an "equivalent".
    if (conference) {
        data.url = _normalizeUrl(conference[JITSI_CONFERENCE_URL_KEY]);
    }

    if (_swallowEvent(store, action, data)) {
        return;
    }

    let type_;

    switch (type) {
    case CONFERENCE_FAILED:
    case CONFERENCE_LEFT:
        type_ = CONFERENCE_TERMINATED;
        break;
    default:
        type_ = type;
        break;
    }

    sendEvent(store, type_, data);
}

/**
 * Sends {@link CONFERENCE_TERMINATED} event when the {@link CONNECTION_FAILED}
 * occurs. It should be done only if the connection fails before the conference
 * instance is created. Otherwise the eventual failure event is supposed to be
 * emitted by the base/conference feature.
 *
 * @param {Store} store - The redux store.
 * @param {Action} action - The redux action.
 * @returns {void}
 */
function _sendConferenceFailedOnConnectionError(store, action) {
    const { locationURL } = store.getState()['features/base/connection'];
    const { connection } = action;

    locationURL
        && forEachConference(
            store,

            // If there's any conference in the  base/conference state then the
            // base/conference feature is supposed to emit a failure.
            conference => conference.getConnection() !== connection)
        && sendEvent(
        store,
        CONFERENCE_TERMINATED,
        /* data */ {
            url: _normalizeUrl(locationURL),
            error: action.error.name
        });
}

/**
 * Determines whether to not send a {@code CONFERENCE_LEFT} event to the native
 * counterpart of the External API.
 *
 * @param {Object} store - The redux store.
 * @param {Action} action - The redux action which is causing the sending of the
 * event.
 * @param {Object} data - The details/specifics of the event to send determined
 * by/associated with the specified {@code action}.
 * @returns {boolean} If the specified event is to not be sent, {@code true};
 * otherwise, {@code false}.
 */
function _swallowConferenceLeft({ getState }, action, { url }) {
    // XXX Internally, we work with JitsiConference instances. Externally
    // though, we deal with URL strings. The relation between the two is many to
    // one so it's technically and practically possible (by externally loading
    // the same URL string multiple times) to try to send CONFERENCE_LEFT
    // externally for a URL string which identifies a JitsiConference that the
    // app is internally legitimately working with.
    let swallowConferenceLeft = false;

    url
        && forEachConference(getState, (conference, conferenceURL) => {
            if (conferenceURL && conferenceURL.toString() === url) {
                swallowConferenceLeft = true;
            }

            return !swallowConferenceLeft;
        });

    return swallowConferenceLeft;
}

/**
 * Determines whether to not send a specific event to the native counterpart of
 * the External API.
 *
 * @param {Object} store - The redux store.
 * @param {Action} action - The redux action which is causing the sending of the
 * event.
 * @param {Object} data - The details/specifics of the event to send determined
 * by/associated with the specified {@code action}.
 * @returns {boolean} If the specified event is to not be sent, {@code true};
 * otherwise, {@code false}.
 */
function _swallowEvent(store, action, data) {
    switch (action.type) {
    case CONFERENCE_LEFT:
        return _swallowConferenceLeft(store, action, data);
    case CONFERENCE_WILL_JOIN:
        // CONFERENCE_WILL_JOIN is dispatched to the external API on SET_ROOM,
        // before the connection is created, so we need to swallow the original
        // one emitted by base/conference.
        return true;

    default:
        return false;
    }
}

/**
 * Handles CallKit's event {@code performSetMutedCallAction}.
 *
 * @param {Object} event - The details of the CallKit event
 * {@code performSetMutedCallAction}.
 * @returns {void}
 */
function _onPerformSetMutedCallAction({ muted }) {
    const { dispatch, getState } = this; // eslint-disable-line no-invalid-this
    //const conference = getCurrentConference(getState);

   // Alert.alert("_onPerformSetMutedCallAction",String(muted));
   // if (conference && conference.callUUID === callUUID) {
        muted = Boolean(muted); // eslint-disable-line no-param-reassign
        sendAnalytics(
            createTrackMutedEvent('audio', 'call-integration', muted));
        dispatch(setAudioMuted(muted, /* ensureTrack */ true));
        logger.debug("_onPerformSetMutedCallAction muted",muted);
    //}
}

/**
 * Handles CallKit's event {@code performSetMutedCallAction}.
 *
 * @param {Object} event - The details of the CallKit event
 * {@code performSetMutedCallAction}.
 * @returns {void}
 */
function _onPerformSetToggleLocalVideoAction({ muted }) {
    const { dispatch, getState } = this; // eslint-disable-line no-invalid-this
    //const conference = getCurrentConference(getState);
   
    //if (conference && conference.callUUID === callUUID) {
       // muted = Boolean(muted); // eslint-disable-line no-param-reassign
        const { enabled: audioOnly } = getState()['features/base/audio-only'];
        const tracks = getState()['features/base/tracks'];
        let _audioOnly =  Boolean(audioOnly);
        let _videoMediaType = getLocalVideoType(tracks);
        let _videoMuted = muted;//isLocalVideoTrackMuted(tracks)
        //Alert.alert('_onPerformSetToggleLocalVideoAction',String(_videoMuted));
        if (_audioOnly) {
            dispatch(
                setAudioOnly(false, /* ensureTrack */ true));
        }
        dispatch( setVideoMuted(
            _videoMuted,
            _videoMediaType,
            VIDEO_MUTISM_AUTHORITY.USER,
            /* ensureTrack */ true));
        logger.debug("_onPerformSetToggleLocalVideoAction _videoMuted=",_videoMuted);
    //}
}

/**
 * Handles CallKit's event {@code performSetMutedCallAction}.
 *
 * @param {Object} event - The details of the CallKit event
 * {@code performSetMutedCallAction}.
 * @returns {void}
 */
function _onPerformToggleCameraFacingModeAction() {
    const { dispatch } = this; // eslint-disable-line no-invalid-this

    // Alert.alert('_onPerformToggleCameraFacingModeAction');
    // logger.debug('_onPerformToggleCameraFacingModeAction',APP);
    dispatch(toggleCameraFacingMode());
    logger.debug("_onPerformToggleCameraFacingModeAction");
}

/**
 * Handles CallKit's event {@code performEndCallAction}.
 *
 * @param {Object} event - The details of the CallKit event
 * {@code performEndCallAction}.
 * @returns {void}
 */
function _onPerformEndCallAction({ callUUID }) {
    const { dispatch, getState } = this; // eslint-disable-line no-invalid-this
    const conference = getCurrentConference(getState);

    if (conference && conference.callUUID === callUUID) {
        // We arrive here when a call is ended by the system, for example, when
        // another incoming call is received and the user selects "End &
        // Accept".
        delete conference.callUUID;
        dispatch(appNavigate(undefined));
        logger.debug("_onPerformEndCallAction callUUID=",callUUID);
    }
}

/**
 * Handles CallKit's event {@code performSetMutedCallAction}.
 *
 * @param {Object} event - The details of the CallKit event
 * {@code performSetMutedCallAction}.
 * @returns {void}
 */
function _onPerformSpeakerModePhoneAction() {
    //const { dispatch, getState } = this; // eslint-disable-line no-invalid-this
    //const conference = getCurrentConference(getState);

    //Alert.alert('_onPerformSpeakerModePhoneAction');
    AudioMode.setAudioDevice("EARPIECE");
    //dispatch(setAudioMuted(muted, /* ensureTrack */ true));
    logger.debug("_onPerformSpeakerModePhoneAction EARPIECE");
}

/**
 * Handles CallKit's event {@code performSetMutedCallAction}.
 *
 * @param {Object} event - The details of the CallKit event
 * {@code performSetMutedCallAction}.
 * @returns {void}
 */
function _onPerformSpeakerModeSpeakerAction() {
    //const { dispatch, getState } = this; // eslint-disable-line no-invalid-this
   // const conference = getCurrentConference(getState);
   //Alert.alert('_onPerformSpeakerModeSpeakerAction');
   // muted = Boolean(muted); // eslint-disable-line no-param-reassign
    AudioMode.setAudioDevice("SPEAKER");
    logger.debug("_onPerformSpeakerModeSpeakerAction SPEAKER");
    
}

/*

DeviceEventEmitter.addListener('performToggleCameraFacingModeAction', function(param) { 
    Alert.alert('DeviceEventEmitter start');
    logger.debug('CallIntegration=');
    //_onPerformToggleCameraFacingModeAction();
  
});
*/
