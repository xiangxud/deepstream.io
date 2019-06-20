import {expect} from 'chai'
import * as C from '../constants'
import PermissionHandlerMock from '../test/mock/permission-handler-mock'
const MessageProcessor = require('./message-processor').default
import LoggerMock from '../test/mock/logger-mock'
import { getTestMocks } from '../test/helper/test-mocks'
import { TOPIC, ACTIONS } from '@deepstream/client/dist/binary-protocol/src/message-constants';
import { CONNECTION_ACTIONS } from '../../binary-protocol/src/message-constants';

let messageProcessor
let log
let lastAuthenticatedMessage = null

describe('the message processor only forwards valid, authorized messages', () => {
  let testMocks
  let client
  let permissionHandlerMock

  const message = {
    topic: C.TOPIC.RECORD,
    action: C.RECORD_ACTIONS.READ,
    name: 'record/name'
  }

  beforeEach(() => {
    testMocks = getTestMocks()
    client = testMocks.getSocketWrapper('someUser')
    permissionHandlerMock  = new PermissionHandlerMock()
    const loggerMock = new LoggerMock()
    log = loggerMock.logSpy
    messageProcessor = new MessageProcessor({}, {
      permissionHandler: permissionHandlerMock,
      logger: loggerMock
    })
    messageProcessor.onAuthenticatedMessage = function (socketWrapper, authenticatedMessage) {
      lastAuthenticatedMessage = authenticatedMessage
    }
  })

  afterEach(() => {
    client.socketWrapperMock.verify()
  })

  it('ignores heartbeats ping messages', () => {
    client.socketWrapperMock
      .expects('sendMessage')
      .never()

    messageProcessor.process(client.socketWrapper, [{ topic: TOPIC.CONNECTION, action: CONNECTION_ACTIONS.PING }])
  })

  it('handles permission errors', () => {
    permissionHandlerMock.nextCanPerformActionResult = 'someError'

    client.socketWrapperMock
      .expects('sendMessage')
      .once()
      .withExactArgs({
        topic: C.TOPIC.RECORD,
        action: C.RECORD_ACTIONS.MESSAGE_PERMISSION_ERROR,
        originalAction: C.RECORD_ACTIONS.READ,
        name: message.name
      })

    messageProcessor.process(client.socketWrapper, [message])

    expect(log).to.have.callCount(1)
    expect(log).to.have.been.calledWith(2, C.RECORD_ACTIONS[C.RECORD_ACTIONS.MESSAGE_PERMISSION_ERROR], 'someError')
  })

  it('rpc permission errors have a correlation id', () => {
    permissionHandlerMock.nextCanPerformActionResult = 'someError'
    const rpcMessage = {
      topic: C.TOPIC.RPC,
      action: C.RPC_ACTIONS.REQUEST,
      name: 'myRPC',
      correlationId: '1234567890',
      data: Buffer.from('{}', 'utf8'),
      parsedData: {}
    }

    client.socketWrapperMock
      .expects('sendMessage')
      .once()
      .withExactArgs({
        topic: C.TOPIC.RPC,
        action: C.RPC_ACTIONS.MESSAGE_PERMISSION_ERROR,
        originalAction: rpcMessage.action,
        name: rpcMessage.name,
        correlationId: rpcMessage.correlationId
      })

    messageProcessor.process(client.socketWrapper, [rpcMessage])

    expect(log).to.have.callCount(1)
    expect(log).to.have.been.calledWith(2, C.RPC_ACTIONS[C.RPC_ACTIONS.MESSAGE_PERMISSION_ERROR], 'someError')
  })

  it('handles denied messages', () => {
    permissionHandlerMock.nextCanPerformActionResult = false

    client.socketWrapperMock
      .expects('sendMessage')
      .once()
      .withExactArgs({
        topic: C.TOPIC.RECORD,
        action: C.RECORD_ACTIONS.MESSAGE_DENIED,
        originalAction: C.RECORD_ACTIONS.READ,
        name: message.name
      })

    messageProcessor.process(client.socketWrapper, [message])
  })

  it('provides the correct arguments to canPerformAction', () => {
    permissionHandlerMock.nextCanPerformActionResult = false

    messageProcessor.process(client.socketWrapper, [message])

    expect(permissionHandlerMock.lastCanPerformActionQueryArgs.length).to.equal(5)
    expect(permissionHandlerMock.lastCanPerformActionQueryArgs[0]).to.equal('someUser')
    expect(permissionHandlerMock.lastCanPerformActionQueryArgs[1].name).to.equal('record/name')
    expect(permissionHandlerMock.lastCanPerformActionQueryArgs[3]).to.deep.equal({})
    expect(permissionHandlerMock.lastCanPerformActionQueryArgs[4]).to.equal(client.socketWrapper)
  })

  it('forwards validated and permissioned messages', () => {
    permissionHandlerMock.nextCanPerformActionResult = true

    messageProcessor.process(client.socketWrapper, [message])

    expect(lastAuthenticatedMessage).to.equal(message as any)
  })
})
