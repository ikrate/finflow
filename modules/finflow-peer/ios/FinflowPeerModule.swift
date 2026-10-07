import ExpoModulesCore
import MultipeerConnectivity
import UIKit

public class FinflowPeerModule: Module, MCSessionDelegate, MCNearbyServiceAdvertiserDelegate, MCNearbyServiceBrowserDelegate {
  private let serviceType = "finflow-sync"
  private let peerIdDefaultsKey = "finflow_mc_peer_id"

  private var myPeerId: MCPeerID?
  private var session: MCSession?
  private var advertiser: MCNearbyServiceAdvertiser?
  private var browser: MCNearbyServiceBrowser?
  private var currentGroupHash: String?

  private var peerIdToMCPeer: [String: MCPeerID] = [:]
  private var mcPeerToPeerId: [MCPeerID: String] = [:]
  private var invitationHandlers: [String: (Bool, MCSession?) -> Void] = [:]

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

    AsyncFunction("start") { (options: [String: Any], promise: Promise) in
      guard let rawDisplayName = options["displayName"] as? String,
            let groupHash = options["groupHash"] as? String else {
        promise.reject("INVALID_PARAMS", "displayName and groupHash are required")
        return
      }

      // Truncate display name to 30 characters
      let displayName = String(rawDisplayName.trimmingCharacters(in: .whitespacesAndNewlines).prefix(30))
      let cleanDisplayName = displayName.isEmpty ? "FinFlow User" : displayName
      let cleanGroupHash = String(groupHash.prefix(8))

      self.currentGroupHash = cleanGroupHash

      DispatchQueue.main.async {
        self.cleanup()

        // Get or create stable MCPeerID
        let peerId = self.getOrCreatePeerId(displayName: cleanDisplayName)
        self.myPeerId = peerId

        // Initialize MCSession with mandatory encryption
        let newSession = MCSession(peer: peerId, securityIdentity: nil, encryptionPreference: .required)
        newSession.delegate = self
        self.session = newSession

        // Initialize Advertiser with discoveryInfo containing only the group hash prefix
        let newAdvertiser = MCNearbyServiceAdvertiser(
          peer: peerId,
          discoveryInfo: ["g": cleanGroupHash],
          serviceType: self.serviceType
        )
        newAdvertiser.delegate = self
        self.advertiser = newAdvertiser
        newAdvertiser.startAdvertisingPeer()

        // Initialize Browser
        let newBrowser = MCNearbyServiceBrowser(peer: peerId, serviceType: self.serviceType)
        newBrowser.delegate = self
        self.browser = newBrowser
        newBrowser.startBrowsingForPeers()

        promise.resolve(nil)
      }
    }

    AsyncFunction("stop") { (promise: Promise) in
      DispatchQueue.main.async {
        self.cleanup()
        promise.resolve(nil)
      }
    }

    AsyncFunction("invite") { (peerIdString: String, contextString: String, promise: Promise) in
      DispatchQueue.main.async {
        guard let browser = self.browser,
              let session = self.session,
              let targetMCPeer = self.peerIdToMCPeer[peerIdString] else {
          promise.reject("PEER_NOT_FOUND", "Peer ID \(peerIdString) not found or browser not active")
          return
        }

        let contextData = contextString.data(using: .utf8)
        browser.invitePeer(targetMCPeer, to: session, withContext: contextData, timeout: 20.0)
        promise.resolve(nil)
      }
    }

    AsyncFunction("respondToInvitation") { (invitationId: String, accept: Bool, promise: Promise) in
      DispatchQueue.main.async {
        guard let handler = self.invitationHandlers[invitationId] else {
          promise.reject("INVITATION_NOT_FOUND", "No pending invitation with ID \(invitationId)")
          return
        }

        self.invitationHandlers.removeValue(forKey: invitationId)
        handler(accept, accept ? self.session : nil)
        promise.resolve(nil)
      }
    }

    AsyncFunction("send") { (peerIdString: String, base64Data: String, promise: Promise) in
      DispatchQueue.main.async {
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
          promise.resolve(nil)
        } catch {
          promise.reject("SEND_FAILED", error.localizedDescription)
        }
      }
    }

    Function("disconnect") { (peerIdString: String?) in
      DispatchQueue.main.async {
        self.session?.disconnect()
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

  private func stringIdFor(mcPeer: MCPeerID) -> String {
    if let existing = mcPeerToPeerId[mcPeer] {
      return existing
    }
    let newId = UUID().uuidString
    peerIdToMCPeer[newId] = mcPeer
    mcPeerToPeerId[mcPeer] = newId
    return newId
  }

  // MARK: - Cleanup & Background Handling

  private func cleanup() {
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
    currentGroupHash = nil
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

  // MARK: - MCNearbyServiceBrowserDelegate

  public func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
    guard let expectedHash = currentGroupHash else { return }

    // Only surface peers advertising the same 8-hex-character group hash
    if let advertisedHash = info?["g"], advertisedHash == expectedHash {
      let peerStringId = stringIdFor(mcPeer: peerID)
      DispatchQueue.main.async {
        self.sendEvent("onPeerFound", [
          "peerId": peerStringId,
          "displayName": peerID.displayName
        ])
      }
    }
  }

  public func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
    if let peerStringId = mcPeerToPeerId[peerID] {
      DispatchQueue.main.async {
        self.sendEvent("onPeerLost", [
          "peerId": peerStringId,
          "displayName": peerID.displayName
        ])
      }
    }
  }

  public func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
    DispatchQueue.main.async {
      self.sendEvent("onError", [
        "code": "BROWSE_FAILED",
        "message": error.localizedDescription
      ])
    }
  }

  // MARK: - MCNearbyServiceAdvertiserDelegate

  public func advertiser(
    _ advertiser: MCNearbyServiceAdvertiser,
    didReceiveInvitationFromPeer peerID: MCPeerID,
    withContext context: Data?,
    invitationHandler: @escaping (Bool, MCSession?) -> Void
  ) {
    let invitationId = UUID().uuidString
    let peerStringId = stringIdFor(mcPeer: peerID)
    let contextString = context.flatMap { String(data: $0, encoding: .utf8) } ?? ""

    invitationHandlers[invitationId] = invitationHandler

    DispatchQueue.main.async {
      self.sendEvent("onInvitation", [
        "invitationId": invitationId,
        "peerId": peerStringId,
        "displayName": peerID.displayName,
        "context": contextString
      ])
    }
  }

  public func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
    DispatchQueue.main.async {
      self.sendEvent("onError", [
        "code": "ADVERTISE_FAILED",
        "message": error.localizedDescription
      ])
    }
  }

  // MARK: - MCSessionDelegate

  public func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
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

    DispatchQueue.main.async {
      self.sendEvent("onPeerState", [
        "peerId": peerStringId,
        "state": stateString
      ])
    }
  }

  public func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
    let peerStringId = stringIdFor(mcPeer: peerID)
    let base64String = data.base64EncodedString()

    DispatchQueue.main.async {
      self.sendEvent("onData", [
        "peerId": peerStringId,
        "data": base64String
      ])
    }
  }

  public func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}

  public func session(
    _ session: MCSession,
    didStartReceivingResourceWithName resourceName: String,
    fromPeer peerID: MCPeerID,
    with progress: Progress
  ) {}

  public func session(
    _ session: MCSession,
    didFinishReceivingResourceWithName resourceName: String,
    fromPeer peerID: MCPeerID,
    at localURL: URL?,
    withError error: Error?
  ) {}
}
