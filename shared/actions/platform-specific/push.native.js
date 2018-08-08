// @flow
import logger from '../../logger'
import * as Constants from '../../constants/push'
import * as NotificationsGen from '../../actions/notifications-gen'
import * as PushTypes from '../../constants/types/push'
import * as ChatConstants from '../../constants/chat2'
import * as ConfigGen from '../config-gen'
import * as Chat2Gen from '../chat2-gen'
import * as PushGen from '../push-gen'
import * as WaitingGen from '../waiting-gen'
import * as ChatTypes from '../../constants/types/chat2'
import * as RPCChatTypes from '../../constants/types/rpc-chat-gen'
import * as Saga from '../../util/saga'
import * as RPCTypes from '../../constants/types/rpc-gen'
import * as PushNotifications from 'react-native-push-notification'
import {isDevApplePushToken} from '../../local-debug'
import {isIOS} from '../../constants/platform'
import {chatTab} from '../../constants/tabs'
import {switchTo} from '../route-tree'
import {createShowUserProfile} from '../profile-gen'
import {NativeEventEmitter, NativeModules, PushNotificationIOS} from 'react-native'

import type {TypedState} from '../../constants/reducer'

const requestPushPermissions = () => (isIOS ? PushNotifications.requestPermissions() : Promise.resolve())
const getShownPushPrompt = () => NativeModules.PushPrompt.getHasShownPushPrompt()
const checkPermissions = () => new Promise((resolve, reject) => PushNotifications.checkPermissions(resolve))

// TODO
// function permissionsNoSaga() {
// return Saga.sequentially([
// Saga.put(PushGen.createPermissionsRequesting({requesting: false})),
// Saga.put(PushGen.createPermissionsPrompt({prompt: false})),
// ])
// }

const updateAppBadge = (_: any, action: NotificationsGen.ReceivedBadgeStatePayload) => {
  const count = (action.payload.badgeState.conversations || []).reduce(
    (total, c) => (c.badgeCounts ? total + c.badgeCounts[`${RPCTypes.commonDeviceType.mobile}`] : total),
    0
  )

  PushNotifications.setApplicationIconBadgeNumber(count)
  if (count === 0) {
    PushNotifications.cancelAllLocalNotifications()
  }
}

function displayNewMessageNotification(
  text: string,
  convID: ?string,
  badgeCount: ?number,
  myMsgID: ?number,
  soundName: ?string
) {
  // Dismiss any non-plaintext notifications for the same message ID
  if (isIOS) {
    PushNotificationIOS.getDeliveredNotifications(param => {
      PushNotificationIOS.removeDeliveredNotifications(
        param.filter(p => p.userInfo && p.userInfo.msgID === myMsgID).map(p => p.identifier)
      )
    })
  }

  logger.info(`Got push notification with soundName '${soundName || ''}'`)
  PushNotifications.localNotification({
    message: text,
    soundName,
    userInfo: {
      convID: convID,
      type: 'chat.newmessage',
    },
    number: badgeCount,
  })
}

// Used to listen to the java intent for notifications
let RNEmitter
// Push notifications on android are very messy. It works differently if we're entirely killed or if we're in the background
// If we're killed it all works. clicking on the notification launches us and we get the onNotify callback and it all works
// If we're backgrounded we get the silent or the silent and real. To work around this we:
// 1. Plumb through the intent from the java side if we relaunch due to push
// 2. We store the last push and re-use it when this event is emitted to just 'rerun' the push
if (!isIOS) {
  RNEmitter = new NativeEventEmitter(NativeModules.KeybaseEngine)
}

let lastPushForAndroid = null
const listenForNativeAndroidIntentNotifications = emitter => {
  if (!RNEmitter) {
    return
  }

  // If android launched due to push
  RNEmitter.addListener('androidIntentNotification', () => {
    if (!lastPushForAndroid) {
      return
    }

    // if plaintext is on we get this but not the real message if we're backgrounded, so convert it to a non-silent type
    if (lastPushForAndroid.type === 'chat.newmessageSilent_2') {
      lastPushForAndroid.type = 'chat.newmessage'
      // grab convo id
      lastPushForAndroid.convID = lastPushForAndroid.c
    }
    // emulate like the user clicked it while we're killed
    lastPushForAndroid.userInteraction = true // force this true
    emitter(
      PushGen.createNotification({
        notification: lastPushForAndroid,
      })
    )
    lastPushForAndroid = null
  })
}

const listenForPushNotificationsFromJS = emitter => {
  // It doesn't look like there is a registrationError being set for iOS.
  // https://github.com/zo0r/react-native-push-notification/issues/261
  PushNotificationIOS.addEventListener('registrationError', error => {
    emitter(
      PushGen.createRegistrationError({
        error,
      })
    )
  })

  const onRegister = token => {
    let tokenType: ?PushTypes.TokenType
    console.log('PUSH TOKEN', token)
    switch (token.os) {
      case 'ios':
        tokenType = isDevApplePushToken ? Constants.tokenTypeAppleDev : Constants.tokenTypeApple
        break
      case 'android':
        tokenType = Constants.tokenTypeAndroidPlay
        break
    }
    if (tokenType) {
      emitter(PushGen.createPushToken({token: token.token, tokenType}))
    } else {
      emitter(PushGen.createRegistrationError({error: new Error(`Unrecognized OS for token: ${token}`)}))
    }
  }

  const onNotification = n => {
    // On iOS, some fields are in notification.data. Also, the
    // userInfo field from the local notification spawned in
    // displayNewMessageNotification gets renamed to
    // data. However, on Android, all fields are in the top level,
    // but the userInfo field is not renamed.
    //
    // Therefore, just pull out all fields from data and userInfo.
    const notification = {
      ...n,
      ...(n.data || {}),
      ...(n.userInfo || {}),
      data: undefined,
      userInfo: undefined,
    }

    // bookkeep for android special handling
    lastPushForAndroid = notification
    emitter(
      PushGen.createNotification({
        notification,
      })
    )
  }

  const onError = error => {
    emitter(PushGen.createError({error}))
  }

  PushNotifications.configure({
    onError,
    onNotification,
    onRegister,
    // Don't request permissions for ios, we'll ask later, after showing UI
    requestPermissions: !isIOS,
    senderID: Constants.androidSenderID,
  })
}

const listenForPushNotifications = () =>
  Saga.call(function*() {
    const pushChannel = yield Saga.eventChannel(emitter => {
      listenForNativeAndroidIntentNotifications(emitter)
      listenForPushNotificationsFromJS(emitter)

      // we never unsubscribe
      return () => {}
    }, Saga.buffers.expanding(10))

    while (true) {
      const action = yield Saga.take(pushChannel)
      yield Saga.put(action)
    }
  })

function* permissionsRequestSaga(): Saga.SagaGenerator<any, any> {
  yield Saga.put(WaitingGen.createIncrementWaiting({key: Constants.permissionsRequestingWaitingKey}))
  if (isIOS) {
    const shownPushPrompt = yield Saga.call(getShownPushPrompt)
    if (shownPushPrompt) {
      // we've already shown the prompt, take them to settings
      yield Saga.all([
        Saga.put(ConfigGen.createOpenAppSettings()),
        Saga.put(PushGen.createPermissionsRequesting({requesting: false})),
        Saga.put(PushGen.createPermissionsPrompt({prompt: false})),
      ])
      return
    }
  }
  try {
    logger.info('Requesting permissions')
    const permissions = yield Saga.call(requestPushPermissions)
    logger.info('Permissions:', permissions)
    if (permissions.alert || permissions.badge) {
      logger.info('Badge or alert push permissions are enabled')
      yield Saga.put(PushGen.createSetHasPermissions({hasPermissions: true}))
    } else {
      logger.info('Badge or alert push permissions are disabled')
      yield Saga.put(PushGen.createSetHasPermissions({hasPermissions: false}))
    }
    // TODO(gabriel): Set permissions we have in store, might want it at some point?
  } finally {
    yield Saga.put(WaitingGen.createDecrementWaiting({key: Constants.permissionsRequestingWaitingKey}))
    yield Saga.put(PushGen.createPermissionsPrompt({prompt: false}))
  }
}

const handleReadMessage = notification => {
  logger.info('Push notification: read message notification received')
  const badges = typeof notification.b === 'string' ? parseInt(notification.b) : notification.b
  if (badges === 0) {
    PushNotifications.cancelAllLocalNotifications()
  }
}

const handleSilentMessage = notification => {
  const {c, m} = notification
  if (!c || !m) {
    logger.error('Push chat notification payload missing conversation ID or msgBoxed')
    return
  }

  let displayPlaintext = notification.n === 'true'

  if (displayPlaintext && notification.x && notification.x > 0) {
    const num = notification.x
    const ageMS = Date.now() - num * 1000
    if (ageMS > 15000) {
      logger.info('Push notification: silent notification is stale:', ageMS)
      displayPlaintext = false
    }
  }

  let membersType: RPCChatTypes.ConversationMembersType
  const membersTypeNumber: number =
    typeof notification.t === 'string' ? parseInt(notification.t, 10) : notification.t || -1
  switch (membersTypeNumber) {
    case RPCChatTypes.commonConversationMembersType.kbfs:
      membersType = RPCChatTypes.commonConversationMembersType.kbfs
      break
    case RPCChatTypes.commonConversationMembersType.team:
      membersType = RPCChatTypes.commonConversationMembersType.team
      break
    case RPCChatTypes.commonConversationMembersType.impteamnative:
      membersType = RPCChatTypes.commonConversationMembersType.impteamnative
      break
    case RPCChatTypes.commonConversationMembersType.impteamupgrade:
      membersType = RPCChatTypes.commonConversationMembersType.impteamupgrade
      break
    default:
      membersType = RPCChatTypes.commonConversationMembersType.kbfs
  }

  return Saga.call(function*() {
    const unboxRes = yield Saga.call(RPCChatTypes.localUnboxMobilePushNotificationRpcPromise, {
      convID: c,
      membersType,
      payload: m,
      pushIDs: typeof notification.p === 'string' ? JSON.parse(notification.p) : notification.p,
      shouldAck: displayPlaintext,
    })

    if (unboxRes) {
      const state: TypedState = yield Saga.select()
      if (!state.config.appFocused) {
        displayNewMessageNotification(
          unboxRes,
          notification.c,
          notification.b,
          notification.d,
          notification.s
        )
      }
    }
  })
}

const handleLoudMessage = notification => {
  console.log('aaa', notification)
  // if (!n.userInteraction) {
  // // ignore it
  // return
  // }

  // const {convID, m} = notification
  // // Check for conversation ID so we know where to navigate to
  // if (!convID) {
  // logger.error('Push chat notification payload missing conversation ID')
  // }
  // const conversationIDKey = ChatTypes.stringToConversationIDKey(convID)
  // yield Saga.put(
  // Chat2Gen.createSelectConversation({
  // conversationIDKey,
  // reason: 'push',
  // })
  // )

  // yield Saga.put(
  // WaitingGen.createIncrementWaiting({key: ChatConstants.waitingKeyPushLoad(conversationIDKey)})
  // )
  // yield Saga.put(switchTo([chatTab, 'conversation']))
  // // If a boxed message is attached to the notification, unbox.
  // if (m) {
  // logger.info('Push notification: unboxing notification message')
  // yield Saga.call(RPCChatTypes.localUnboxMobilePushNotificationRpcPromise, {
  // convID,
  // membersType,
  // payload: m,
  // shouldAck: false,
  // })
  // }

  /* catch (err) {
        logger.error('failed to handle new message push', err)
        handledPushThisSession = false
      } */
}

const handleFollow = notification => {
  if (!notification.userInteraction) {
    // ignore it
    return
  }
  const {username} = notification
  if (!username) {
    logger.error('Follow notification payload missing username', JSON.stringify(notification))
    return
  }
  logger.info('Push notification: follow received, follower= ', username)
  return Saga.put(createShowUserProfile({username}))
}

const handlePush = (_: any, action: PushGen.NotificationPayload) => {
  try {
    const notification = action.payload.notification
    logger.info(`Push notification of type ${notification.type ? notification.type : 'unknown'} received.`)

    switch (notification.type) {
      case 'chat.readmessage':
        return handleReadMessage(notification)
      case 'chat.newmessageSilent_2':
        return handleSilentMessage(notification)
      case 'chat.newmessage':
        console.error('aaa nojima', notification)
      // ? this isonly for the first push? debug this
      // return handleLoudMessage(n)
      case 'follow':
        return handleFollow(notification)
      default:
        logger.error('Push notification payload missing or unknown type')
    }
  } catch (e) {
    if (__DEV__) {
      console.error(e)
    }

    logger.error('Failed to handle push')
  }
}

function pushTokenSaga(action: PushGen.PushTokenPayload) {
  const {token, tokenType} = action.payload
  return Saga.sequentially([
    Saga.put(PushGen.createUpdatePushToken({token, tokenType})),
    Saga.put(PushGen.createSavePushToken()),
  ])
}

function* savePushTokenSaga(): Saga.SagaGenerator<any, any> {
  try {
    const state: TypedState = yield Saga.select()
    const token = state.push.token
    const tokenType = state.push.tokenType
    const deviceID = state.config.deviceID
    if (!deviceID) {
      throw new Error('No device available for saving push token')
    }
    if (!token) {
      throw new Error('No push token available to save')
    }

    const args = [
      {key: 'push_token', value: token},
      {key: 'device_id', value: deviceID},
      {key: 'token_type', value: tokenType || ''},
    ]

    yield Saga.call(RPCTypes.apiserverPostRpcPromise, {
      args,
      endpoint: 'device/push_token',
    })
  } catch (err) {
    logger.warn('Error trying to save push token:', err)
  }
}

function* checkIOSPushSaga(): Saga.SagaGenerator<any, any> {
  const permissions = yield Saga.call(checkPermissions)
  logger.debug('Got push notification permissions:', JSON.stringify(permissions, null, 2))
  const shownPushPrompt = yield Saga.call(getShownPushPrompt)
  logger.debug(
    shownPushPrompt
      ? 'We have requested push permissions before'
      : 'We have not requested push permissions before'
  )
  if (!permissions.alert && !permissions.badge) {
    logger.info('Badge and alert permissions are disabled; showing prompt')
    yield Saga.all([
      Saga.put(PushGen.createSetHasPermissions({hasPermissions: false})),
      Saga.put(
        PushGen.createPermissionsPrompt({
          prompt: true,
        })
      ),
    ])
  } else {
    // badge or alert permissions are enabled
    logger.info('Badge or alert permissions are enabled. Getting token.')
    yield Saga.all([
      Saga.put(PushGen.createSetHasPermissions({hasPermissions: true})),
      Saga.call(requestPushPermissions),
    ])
  }
}

const deletePushToken = (state: TypedState) =>
  Saga.call(function*() {
    const waitKey = 'push:deleteToken'
    yield Saga.put(ConfigGen.createLogoutHandshakeWait({increment: true, name: waitKey}))

    try {
      const tokenType = state.push.tokenType
      if (!tokenType) {
        // No push token to remove.
        logger.info('Not deleting push token -- none to remove')
        return
      }

      const deviceID = state.config.deviceID
      if (!deviceID) {
        logger.info('No device id available for saving push token')
        return
      }

      yield Saga.call(RPCTypes.apiserverDeleteRpcPromise, {
        args: [{key: 'device_id', value: deviceID}, {key: 'token_type', value: tokenType}],
        endpoint: 'device/push_token',
      })
    } catch (e) {
    } finally {
      yield Saga.put(ConfigGen.createLogoutHandshakeWait({increment: false, name: waitKey}))
    }
  })

const recheckPermissions = (_: any, action: ConfigGen.MobileAppStatePayload) => {
  if (action.payload.nextAppState !== 'active') {
    return
  }

  return Saga.call(function*() {
    console.log('Checking push permissions')
    const permissions = yield Saga.call(checkPermissions)
    if (permissions.alert || permissions.badge) {
      logger.info('Found push permissions ENABLED on app focus')
      const state: TypedState = yield Saga.select()
      const hasPermissions = state.push.hasPermissions
      if (!hasPermissions) {
        logger.info('Had no permissions before, requesting permissions to get token')
        yield Saga.call(requestPushPermissions)
      }
      yield Saga.put(PushGen.createSetHasPermissions({hasPermissions: true}))
    } else {
      logger.info('Found push permissions DISABLED on app focus')
      yield Saga.put(PushGen.createSetHasPermissions({hasPermissions: false}))
    }
  })
}

function* pushSaga(): Saga.SagaGenerator<any, any> {
  // yield Saga.safeTakeLatest(PushGen.permissionsRequest, permissionsRequestSaga)
  // yield Saga.safeTakeLatestPure(PushGen.permissionsNo, permissionsNoSaga)
  // yield Saga.safeTakeLatestPure(PushGen.pushToken, pushTokenSaga)
  // yield Saga.safeTakeLatest(PushGen.savePushToken, savePushTokenSaga)
  // yield Saga.safeTakeLatest(PushGen.configurePush, configurePushSaga)
  // yield Saga.safeTakeEvery(PushGen.checkIOSPush, checkIOSPushSaga)
  yield Saga.actionToAction(PushGen.notification, handlePush)
  yield Saga.actionToAction(ConfigGen.logoutHandshake, deletePushToken)
  yield Saga.actionToAction(NotificationsGen.receivedBadgeState, updateAppBadge)

  yield Saga.actionToAction(ConfigGen.daemonHandshake, listenForPushNotifications)

  if (isIOS) {
    yield Saga.actionToAction(ConfigGen.mobileAppState, recheckPermissions)
  }
}

export default pushSaga