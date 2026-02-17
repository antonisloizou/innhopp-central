export {}; // ensure this file is treated as a module

declare global {
  interface Window {
    google?: typeof google;
  }

  namespace google {
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
