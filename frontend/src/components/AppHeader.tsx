import { ReactNode } from 'react';
import logo from '../assets/logo.webp';

const INNHOPP_WEBSITE_URL = 'https://www.innhopp.com';

type AppHeaderProps = {
  actions?: ReactNode;
};

const AppHeader = ({ actions }: AppHeaderProps) => (
  <header className="app-header">
    <a className="brand" href={INNHOPP_WEBSITE_URL}>
      <img src={logo} alt="Innhopp Central logo" className="brand-logo" />
    </a>
    {actions ? <div className="header-actions">{actions}</div> : null}
  </header>
);

export default AppHeader;
