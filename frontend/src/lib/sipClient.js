import { UserAgent } from "sip.js";
import { SimpleUser } from "sip.js/lib/platform/web";
import { makeSipDestination } from "./phone";

function responseReason(response, fallback) {
  const message = response?.message;
  const code = message?.statusCode;
  const reason = message?.reasonPhrase;

  return [code, reason].filter(Boolean).join(" ") || fallback;
}

export class RingnexSipClient {
  constructor(config, remoteAudio, handlers = {}) {
    this.config = config;
    this.handlers = handlers;

    const audioConstraint = config.microphoneId
      ? {
        deviceId: { exact: config.microphoneId },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
      : {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      };

    this.user = new SimpleUser(config.wssUrl, {
      aor: `sip:${config.username}@${config.domain}`,

      delegate: {
        onServerConnect: () =>
          handlers.onServerConnect?.(),

        onServerDisconnect: (error) =>
          handlers.onServerDisconnect?.(error),

        onRegistered: () =>
          handlers.onRegistered?.(),

        onUnregistered: () =>
          handlers.onUnregistered?.(),

        onCallCreated: () =>
          handlers.onCallCreated?.(
            this.getRemoteIdentity()
          ),

        onCallReceived: () =>
          handlers.onCallReceived?.(
            this.getRemoteIdentity()
          ),

        onCallAnswered: () =>
          handlers.onCallAnswered?.(
            this.getRemoteIdentity()
          ),

        onCallHangup: () =>
          handlers.onCallHangup?.(),

        onCallHold: (held) =>
          handlers.onCallHold?.(held),

        onCallDTMFReceived: (tone, duration) =>
          handlers.onCallDTMFReceived?.(
            tone,
            duration
          )
      },

      media: {
        constraints: {
          audio: audioConstraint,
          video: false
        },

        remote: {
          audio: remoteAudio
        }
      },

      reconnectionAttempts: 5,
      reconnectionDelay: 4,

      registererOptions: {
        expires: 300,
        refreshFrequency: 75
      },

      sendDTMFUsingSessionDescriptionHandler: true,

      userAgentOptions: {
        authorizationUsername: config.username,
        authorizationPassword: config.password,
        displayName:
          config.displayName || config.username,

        logBuiltinEnabled: false,

        sessionDescriptionHandlerFactoryOptions: {
          iceGatheringTimeout: 500
        }
      }
    });
  }

  async connectAndRegister() {
    await this.user.connect();

    await this.user.register({
      requestDelegate: {
        onAccept: () =>
          this.handlers.onRegistrationAccepted?.(),

        onReject: (response) =>
          this.handlers.onRegistrationRejected?.(
            responseReason(
              response,
              "SIP registration rejected"
            )
          )
      }
    });
  }

  async disconnect() {
    if (!this.user) return;

    try {
      if (this.user.isConnected()) {
        await this.user.unregister();
      }
    } finally {
      if (this.user.isConnected()) {
        await this.user.disconnect();
      }
    }
  }

  async call(number) {
    const destination = makeSipDestination(
      number,
      this.config.domain
    );

    await this.user.call(
      destination,
      {},
      {
        requestDelegate: {
          onTrying: () =>
            this.handlers.onCallTrying?.(),

          onProgress: () =>
            this.handlers.onCallProgress?.(),

          onReject: (response) =>
            this.handlers.onCallRejected?.(
              responseReason(
                response,
                "The call was rejected"
              )
            )
        }
      }
    );
  }

  answer() {
    return this.user.answer();
  }

  decline() {
    return this.user.decline();
  }

  hangup() {
    return this.user.hangup();
  }

  mute() {
    this.user.mute();
  }

  unmute() {
    this.user.unmute();
  }

  hold() {
    return this.user.hold();
  }

  unhold() {
    return this.user.unhold();
  }

  sendDTMF(tone) {
    return this.user.sendDTMF(tone);
  }

  /**
   * Blind transfer current active call.
   *
   * Example:
   * transfer("1002")
   *
   * Active PSTN/customer call:
   * Customer <-> Agent01
   *
   * becomes:
   * Customer <-> Agent02
   */
  async transfer(number) {
    const session = this.user?.session;

    if (!session) {
      throw new Error(
        "No active call available to transfer."
      );
    }

    const destination = makeSipDestination(
      number,
      this.config.domain
    );

    const target = UserAgent.makeURI(destination);

    if (!target) {
      throw new Error(
        "Invalid transfer destination."
      );
    }

    try {
      await session.refer(target, {
        requestDelegate: {
          onAccept: async () => {
            this.handlers.onTransferAccepted?.(number);

            try {
              await this.user.hangup();
            } catch (error) {
              console.error(
                "Failed to hang up original call after transfer:",
                error
              );
            }
          },

          onReject: (response) => {
            const reason = responseReason(
              response,
              "Transfer rejected"
            );

            this.handlers.onTransferRejected?.(
              reason
            );
          }
        }
      });
    } catch (error) {
      this.handlers.onTransferFailed?.(
        error
      );

      throw error;
    }
  }

  getRemoteIdentity() {
    const identity =
      this.user?.session?.remoteIdentity;

    return {
      displayName:
        identity?.displayName || "",

      number:
        identity?.uri?.user ||
        "Unknown caller"
    };
  }
}