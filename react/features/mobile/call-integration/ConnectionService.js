import { NativeEventEmitter, NativeModules } from 'react-native';
const logger = require('jitsi-meet-logger').getLogger(__filename);

let ConnectionService = NativeModules.ConnectionService;

// XXX Rather than wrapping ConnectionService in a new class and forwarding
// the many methods of the latter to the former, add the one additional
// method that we need to ConnectionService.
if (ConnectionService) {
    const eventEmitter = new NativeEventEmitter(ConnectionService);

    ConnectionService = {
        ...ConnectionService,
        addListener: eventEmitter.addListener.bind(eventEmitter),
        registerSubscriptions(context, delegate) {
            logger.debug('registerSubscriptions');
            
            return [
                ConnectionService.addListener(
                    'org.jitsi.meet:features/connection_service#disconnect',
                    delegate._onPerformEndCallAction,
                    context),
                ConnectionService.addListener(
                    'org.jitsi.meet:features/connection_service#abort',
                    delegate._onPerformEndCallAction,
                    context),
                ConnectionService.addListener(
                    'performEndCallAction',
                     delegate._onPerformEndCallAction,
                    context),
                ConnectionService.addListener(
                    'performSetToggleLocalVideoAction',
                    delegate._onPerformSetToggleLocalVideoAction,
                    context),
                ConnectionService.addListener(
                    'performToggleCameraFacingModeAction',
                    delegate._onPerformToggleCameraFacingModeAction,
                    context),
                ConnectionService.addListener(
                    'performSpeakerModeAction',
                    delegate._onPerformSpeakerModeAction,
                    context),
                ConnectionService.addListener(
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

export default ConnectionService;
