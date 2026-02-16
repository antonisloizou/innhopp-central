export {}; // ensure this file is treated as a module

declare global {
  interface Window {
    google?: typeof google;
  }

  namespace google {
    namespace maps {
      interface Duration {
        text: string;
        value: number;
      }

      interface DirectionsLeg {
        duration?: Duration;
      }

      interface DirectionsRoute {
        legs: DirectionsLeg[];
      }

      interface DirectionsResult {
        routes: DirectionsRoute[];
      }

      type TravelMode = 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT';
      type DirectionsStatus =
        | 'OK'
        | 'NOT_FOUND'
        | 'ZERO_RESULTS'
        | 'MAX_WAYPOINTS_EXCEEDED'
        | 'MAX_ROUTE_LENGTH_EXCEEDED'
        | 'INVALID_REQUEST'
        | 'OVER_QUERY_LIMIT'
        | 'REQUEST_DENIED'
        | 'UNKNOWN_ERROR';

      interface DirectionsRequest {
        origin: string;
        destination: string;
        travelMode: TravelMode;
      }

      class DirectionsService {
        route(
          request: DirectionsRequest,
          callback: (result: DirectionsResult | null, status: DirectionsStatus) => void
        ): void;
      }
    }

    namespace accounts {
      namespace id {
        interface CredentialResponse {
          credential: string;
          clientId: string;
          select_by: string;
        }

        interface InitializeOptions {
          client_id: string;
          callback: (response: CredentialResponse) => void;
          auto_select?: boolean;
          cancel_on_tap_outside?: boolean;
        }

        interface ButtonConfiguration {
          type?: 'standard' | 'icon';
          theme?: 'outline' | 'filled_blue' | 'filled_black';
          size?: 'large' | 'medium' | 'small';
          text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
          shape?: 'rectangular' | 'pill' | 'circle' | 'square';
          logo_alignment?: 'left' | 'center';
        }

        function initialize(options: InitializeOptions): void;
        function renderButton(container: HTMLElement, options?: ButtonConfiguration): void;
        function prompt(): void;
      }
    }
  }
}
