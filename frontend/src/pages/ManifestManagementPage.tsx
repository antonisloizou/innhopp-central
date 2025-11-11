const manifests = [
  {
    id: 'MAN-401A',
    event: 'Arctic Fjord Hop',
    loadNumber: 1,
    aircraft: 'DHC-6 Twin Otter',
    jumpRun: 'Heading 110° @ 13,500 ft',
    slots: [
      { name: 'Kari Nilsen', role: 'Participant', gear: 'Rig #42' },
      { name: 'Mats Ødegaard', role: 'Jump Leader', gear: 'Rig #07' },
      { name: 'Lena Jakobsen', role: 'Videographer', gear: 'Helmet Cam 12' }
    ]
  },
  {
    id: 'MAN-401B',
    event: 'Arctic Fjord Hop',
    loadNumber: 2,
    aircraft: 'DHC-6 Twin Otter',
    jumpRun: 'Heading 125° @ 14,000 ft',
    slots: [
      { name: 'Jonas Vik', role: 'Participant', gear: 'Rig #53' },
      { name: 'Eirin Solberg', role: 'Participant', gear: 'Rig #21' },
      { name: 'Thomas Pettersen', role: 'Jump Master', gear: 'Rig #01' }
    ]
  }
];

const ManifestManagementPage = () => (
  <section>
    <header className="page-header">
      <div>
        <h2>Manifest Management</h2>
        <p>Assign crew, balance loads, and ensure aircraft utilization is optimized.</p>
      </div>
      <button className="primary">Create manifest</button>
    </header>
    <div className="stack">
      {manifests.map((manifest) => (
        <article key={manifest.id} className="card">
          <header className="card-header">
            <div>
              <h3>
                Load {manifest.loadNumber}: {manifest.event}
              </h3>
              <p>{manifest.jumpRun}</p>
            </div>
            <span className="badge neutral">{manifest.aircraft}</span>
          </header>
          <table className="table">
            <thead>
              <tr>
                <th>Slot</th>
                <th>Role</th>
                <th>Gear Allocation</th>
              </tr>
            </thead>
            <tbody>
              {manifest.slots.map((slot) => (
                <tr key={slot.name}>
                  <td>{slot.name}</td>
                  <td>{slot.role}</td>
                  <td>{slot.gear}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <footer className="card-footer">
            <button className="secondary">Send briefings</button>
            <button className="ghost">Export load sheet</button>
          </footer>
        </article>
      ))}
    </div>
  </section>
);

export default ManifestManagementPage;
