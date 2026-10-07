import ExpoModulesCore
import MultipeerConnectivity
import UIKit

public struct PeerStartOptions: Record {
  public init() {}
  @Field public var displayName: String = ""
  @Field public var groupHash: String = ""
}

public class FinflowPeerModule: Module {
  private let serviceType = "finflow-sync"
  private let peerIdDefaultsKey = "finflow_mc_peer_id"

  private var manager: MultipeerManager?
  private var backgroundObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("FinflowPeer")

    Events(
      "onPeerFound",
      "onPeerLost",
      "onInvitation",
      "onPeerState",
      "onData",
      "onError"
    )

    OnCreate {
      self.setupBackgroundObserver()
    }

    OnDestroy {
      self.tearDownBackgroundObserver()
      self.cleanup()
    }

    AsyncFunction("start") { (options: PeerStartOptions, promise: Promise) -> Void in
      let rawDisplayName = options.displayName
      let groupHash = options.groupHash

      let displayName = String(rawDisplayName.trimmingCharacters(in: .whitespacesAndNewlines).prefix(30))
      let cleanDisplayName = displayName.isEmpty ? "FinFlow User" : displayName
      let cleanGroupHash = String(groupHash.prefix(8))

      DispatchQueue.main.async {
        self.cleanup()

        let peerId = self.getOrCreatePeerId(displayName: cleanDisplayName)
        let mgr = MultipeerManager(
          module: self,
          peerId: peerId,
          serviceType: self.serviceType,
          groupHash: cleanGroupHash
        )
        self.manager = mgr
        mgr.start()

        promise.resolve()
      }
    }

    AsyncFunction("stop") { (promise: Promise) -> Void in
      DispatchQueue.main.async {
        self.cleanup()
        promise.resolve()
      }
    }

    AsyncFunction("invite") { (peerIdString: String, contextString: String, promise: Promise) -> Void in
      DispatchQueue.main.async {
        guard let mgr = self.manager else {
          promise.reject("SESSION_NOT_INITIALIZED", "Multipeer manager not active")
          return
        }
        mgr.invite(peerIdString: peerIdString, contextString: contextString, promise: promise)
      }
    }

    AsyncFunction("respondToInvitation") { (invitationId: String, accept: Bool, promise: Promise) -> Void in
      DispatchQueue.main.async {
        guard let mgr = self.manager else {
          promise.reject("SESSION_NOT_INITIALIZED", "Multipeer manager not active")
          return
        }
        mgr.respondToInvitation(invitationId: invitationId, accept: accept, promise: promise)
      }
    }

    AsyncFunction("send") { (peerIdString: String, base64Data: String, promise: Promise) -> Void in
      DispatchQueue.main.async {
        guard let mgr = self.manager else {
          promise.reject("SESSION_NOT_INITIALIZED", "Session not initialized")
          return
        }
        mgr.send(peerIdString: peerIdString, base64Data: base64Data, promise: promise)
      }
    }

    Function("disconnect") { (peerIdString: String?) -> Void in
      DispatchQueue.main.async {
        self.manager?.disconnect()
      }
    }
  }

  // MARK: - Stable MCPeerID Management

  private func getOrCreatePeerId(displayName: String) -> MCPeerID {
    if let data = UserDefaults.standard.data(forKey: peerIdDefaultsKey),
       let saved = try? NSKeyedUnarchiver.unarchivedObject(ofClass: MCPeerID.self, from: data),
       saved.displayName == displayName {
      return saved
    }

    let newPeerId = MCPeerID(displayName: displayName)
    if let archived = try? NSKeyedArchiver.archivedData(withRootObject: newPeerId, requiringSecureCoding: true) {
      UserDefaults.standard.set(archived, forKey: peerIdDefaultsKey)
    }
    return newPeerId
  }

  // MARK: - Cleanup & Background Handling

  private func cleanup() {
    manager?.stop()
    manager = nil
  }

  private func setupBackgroundObserver() {
    backgroundObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.didEnterBackgroundNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.cleanup()
    }
  }

  private func tearDownBackgroundObserver() {
    if let observer = backgroundObserver {
      NotificationCenter.default.removeObserver(observer)
      backgroundObserver = nil
    }
  }
}

// MARK: - Dedicated NSObject Multipeer Delegate Coordinator

private class MultipeerManager: NSObject, MCSessionDelegate, MCNearbyServiceAdvertiserDelegate, MCNearbyServiceBrowserDelegate {
  weak var module: FinflowPeerModule?
  let myPeerId: MCPeerID
  let serviceType: String
  let groupHash: String

  var session: MCSession?
  var advertiser: MCNearbyServiceAdvertiser?
  var browser: MCNearbyServiceBrowser?

  var peerIdToMCPeer: [String: MCPeerID] = [:]
  var mcPeerToPeerId: [MCPeerID: String] = [:]
  var invitationHandlers: [String: (Bool, MCSession?) -> Void] = [:]

  init(module: FinflowPeerModule, peerId: MCPeerID, serviceType: String, groupHash: String) {
    self.module = module
    self.myPeerId = peerId
    self.serviceType = serviceType
    self.groupHash = groupHash
    super.init()
  }

  func start() {
    let newSession = MCSession(peer: myPeerId, securityIdentity: nil, encryptionPreference: .required)
    newSession.delegate = self
    self.session = newSession

    let newAdvertiser = MCNearbyServiceAdvertiser(
      peer: myPeerId,
      discoveryInfo: ["g": groupHash],
      serviceType: serviceType
    )
    newAdvertiser.delegate = self
    self.advertiser = newAdvertiser
    newAdvertiser.startAdvertisingPeer()

    let newBrowser = MCNearbyServiceBrowser(peer: myPeerId, serviceType: serviceType)
    newBrowser.delegate = self
    self.browser = newBrowser
    newBrowser.startBrowsingForPeers()
  }

  func stop() {
    advertiser?.stopAdvertisingPeer()
    advertiser?.delegate = nil
    advertiser = nil

    browser?.stopBrowsingForPeers()
    browser?.delegate = nil
    browser = nil

    session?.disconnect()
    session?.delegate = nil
    session = nil

    peerIdToMCPeer.removeAll()
    mcPeerToPeerId.removeAll()
    invitationHandlers.removeAll()
  }

  func invite(peerIdString: String, contextString: String, promise: Promise) {
    guard let browser = self.browser,
          let session = self.session,
          let targetMCPeer = self.peerIdToMCPeer[peerIdString] else {
      promise.reject("PEER_NOT_FOUND", "Peer ID \(peerIdString) not found or browser not active")
      return
    }

    let contextData = contextString.data(using: .utf8)
    browser.invitePeer(targetMCPeer, to: session, withContext: contextData, timeout: 20.0)
    promise.resolve()
  }

  func respondToInvitation(invitationId: String, accept: Bool, promise: Promise) {
    guard let handler = self.invitationHandlers[invitationId] else {
      promise.reject("INVITATION_NOT_FOUND", "No pending invitation with ID \(invitationId)")
      return
    }

    self.invitationHandlers.removeValue(forKey: invitationId)
    handler(accept, accept ? self.session : nil)
    promise.resolve()
  }

  func send(peerIdString: String, base64Data: String, promise: Promise) {
    guard let session = self.session else {
      promise.reject("SESSION_NOT_INITIALIZED", "Session not initialized")
      return
    }

    guard let targetMCPeer = self.peerIdToMCPeer[peerIdString] else {
      promise.reject("PEER_NOT_FOUND", "Target peer \(peerIdString) not found")
      return
    }

    guard let rawData = Data(base64Encoded: base64Data) else {
      promise.reject("INVALID_DATA", "Payload must be a valid base64 string")
      return
    }

    do {
      try session.send(rawData, toPeers: [targetMCPeer], with: .reliable)
      promise.resolve()
    } catch {
      promise.reject("SEND_FAILED", error.localizedDescription)
    }
  }

  func disconnect() {
    session?.disconnect()
  }

  func stringIdFor(mcPeer: MCPeerID) -> String {
    if let existing = mcPeerToPeerId[mcPeer] {
      return existing
    }
    let newId = UUID().uuidString
    peerIdToMCPeer[newId] = mcPeer
    mcPeerToPeerId[mcPeer] = newId
    return newId
  }

  // MARK: - MCNearbyServiceBrowserDelegate

  func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
    guard let advertisedHash = info?["g"], advertisedHash == groupHash else { return }
    let peerStringId = stringIdFor(mcPeer: peerID)
    DispatchQueue.main.async { [weak self] in
      self?.module?.sendEvent("onPeerFound", [
        "peerId": peerStringId,
        "displayName": peerID.displayName
      ])
    }
  }

  func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
    guard let peerStringId = mcPeerToPeerId[peerID] else { return }
    DispatchQueue.main.async { [weak self] in
      self?.module?.sendEvent("onPeerLost", [
        "peerId": peerStringId,
        "displayName": peerID.displayName
      ])
    }
  }

  func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
    DispatchQueue.main.async { [weak self] in
      self?.module?.sendEvent("onError", [
        "code": "BROWSE_FAILED",
        "message": error.localizedDescription
      ])
    }
  }

  // MARK: - MCNearbyServiceAdvertiserDelegate

  func advertiser(
    _ advertiser: MCNearbyServiceAdvertiser,
    didReceiveInvitationFromPeer peerID: MCPeerID,
    withContext context: Data?,
    invitationHandler: @escaping (Bool, MCSession?) -> Void
  ) {
    let invitationId = UUID().uuidString
    let peerStringId = stringIdFor(mcPeer: peerID)
    let contextString = context.flatMap { String(data: $0, encoding: .utf8) } ?? ""

    invitationHandlers[invitationId] = invitationHandler

    DispatchQueue.main.async { [weak self] in
      self?.module?.sendEvent("onInvitation", [
        "invitationId": invitationId,
        "peerId": peerStringId,
        "displayName": peerID.displayName,
        "context": contextString
      ])
    }
  }

  func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
    DispatchQueue.main.async { [weak self] in
      self?.module?.sendEvent("onError", [
        "code": "ADVERTISE_FAILED",
        "message": error.localizedDescription
      ])
    }
  }

  // MARK: - MCSessionDelegate

  func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
    let peerStringId = stringIdFor(mcPeer: peerID)
    let stateString: String
    switch state {
    case .connecting:
      stateString = "connecting"
    case .connected:
      stateString = "connected"
    case .notConnected:
      stateString = "disconnected"
    @unknown default:
      stateString = "disconnected"
    }

    DispatchQueue.main.async { [weak self] in
      self?.module?.sendEvent("onPeerState", [
        "peerId": peerStringId,
        "state": stateString
      ])
    }
  }

  func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
    let peerStringId = stringIdFor(mcPeer: peerID)
    let base64String = data.base64EncodedString()

    DispatchQueue.main.async { [weak self] in
      self?.module?.sendEvent("onData", [
        "peerId": peerStringId,
        "data": base64String
      ])
    }
  }

  func session(
    _ session: MCSession,
    didReceiveCertificate certificate: [Any]?,
    fromPeer peerID: MCPeerID,
    certificateHandler: @escaping (Bool) -> Void
  ) {
    certificateHandler(true)
  }

  func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}

  func session(
    _ session: MCSession,
    didStartReceivingResourceWithName resourceName: String,
    fromPeer peerID: MCPeerID,
    with progress: Progress
  ) {}

  func session(
    _ session: MCSession,
    didFinishReceivingResourceWithName resourceName: String,
    fromPeer peerID: MCPeerID,
    at localURL: URL?,
    withError error: Error?
  ) {}
}
