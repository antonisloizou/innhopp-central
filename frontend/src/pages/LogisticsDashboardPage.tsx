const transportLegs = [
  {
    route: 'Harbor → Staging Hangar',
    departure: '05:30',
    arrival: '06:10',
    driver: 'Linnea',
    status: 'On time'
  },
  {
    route: 'Staging Hangar → LZ Bravo',
    departure: '06:40',
    arrival: '07:20',
    driver: 'Henrik',
    status: 'Fuel stop en route'
  }
];

const LogisticsDashboardPage = () => (
  <section>
    <header className="page-header">
      <div>
        <h2>Logistics Dashboards</h2>
        <p>Monitor transport, gear readiness, and ground crew assignments in real time.</p>
      </div>
      <button className="primary">Configure alerts</button>
    </header>
    <div className="grid two-column">
      <article className="card">
        <header className="card-header">
          <h3>Transport legs</h3>
        </header>
        <table className="table">
          <thead>
            <tr>
              <th>Route</th>
              <th>Depart</th>
              <th>Arrive</th>
              <th>Driver</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {transportLegs.map((leg) => (
              <tr key={leg.route}>
                <td>{leg.route}</td>
                <td>{leg.departure}</td>
                <td>{leg.arrival}</td>
                <td>{leg.driver}</td>
                <td>{leg.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </div>
  </section>
);

export default LogisticsDashboardPage;
