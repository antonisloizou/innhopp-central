const onboardingSteps = [
  {
    title: 'Registration Review',
    description: 'Confirm contact details, selected package, and waiver acknowledgement.',
    action: 'Open CRM record'
  },
  {
    title: 'Credentials & Training',
    description: 'Validate license expiry, medical clearance, and equipment currency.',
    action: 'Request missing documents'
  },
  {
    title: 'Payments & Deposits',
    description: 'Verify deposit receipts and outstanding balances before manifest assignment.',
    action: 'Send payment reminder'
  },
  {
    title: 'Briefings & Communications',
    description: 'Schedule safety briefings, send packing list, and confirm arrival logistics.',
    action: 'Share onboarding pack'
  }
];

const ParticipantOnboardingPage = () => (
  <section>
    <header className="page-header">
      <div>
        <h2>Participant Onboarding</h2>
        <p>Track readiness tasks and ensure every jumper is cleared to fly.</p>
      </div>
      <button className="primary">Invite participant</button>
    </header>
    <div className="grid two-column">
      {onboardingSteps.map((step) => (
        <article key={step.title} className="card">
          <header className="card-header">
            <h3>{step.title}</h3>
          </header>
          <p>{step.description}</p>
          <footer className="card-footer">
            <button className="secondary">{step.action}</button>
            <button className="ghost">Add note</button>
          </footer>
        </article>
      ))}
    </div>
  </section>
);

export default ParticipantOnboardingPage;
