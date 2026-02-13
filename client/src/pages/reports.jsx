import { useState, useEffect } from 'react';
import { DB_URL } from '../env';
import './reports.css';

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'cz_generation', 'simulation'

  useEffect(() => {
    fetchReports();
  }, [filter]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = filter !== 'all' ? `?run_type=${filter}` : '';
      const res = await fetch(`${DB_URL}reports${params}`);
      if (res.ok) {
        const data = await res.json();
        setReports(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (ms) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  const getStatusBadge = (status) => {
    const colors = {
      running: 'status-running',
      completed: 'status-completed',
      failed: 'status-failed',
    };
    return <span className={`status-badge ${colors[status] || ''}`}>{status}</span>;
  };

  const getTypeBadge = (type) => {
    const labels = {
      cz_generation: 'CZ Generation',
      simulation: 'Simulation',
    };
    return <span className={`type-badge type-${type}`}>{labels[type] || type}</span>;
  };

  const getLevelClass = (level) => {
    return `log-${level}`;
  };

  return (
    <div className="reports-page">
      <div className="reports-header">
        <h1>Run Reports</h1>
        <div className="filter-buttons">
          <button 
            className={filter === 'all' ? 'active' : ''} 
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button 
            className={filter === 'cz_generation' ? 'active' : ''} 
            onClick={() => setFilter('cz_generation')}
          >
            CZ Generation
          </button>
          <button 
            className={filter === 'simulation' ? 'active' : ''} 
            onClick={() => setFilter('simulation')}
          >
            Simulation
          </button>
          <button onClick={fetchReports} className="refresh-btn">
            ↻ Refresh
          </button>
        </div>
      </div>

      <div className="reports-container">
        <div className="reports-list">
          {loading ? (
            <div className="loading">Loading reports...</div>
          ) : reports.length === 0 ? (
            <div className="empty">No reports found. Run a CZ generation or simulation to see reports here.</div>
          ) : (
            reports.map((report) => (
              <div
                key={report.id}
                className={`report-item ${selectedReport?.id === report.id ? 'selected' : ''}`}
                onClick={() => setSelectedReport(report)}
              >
                <div className="report-item-header">
                  {getTypeBadge(report.run_type)}
                  {getStatusBadge(report.status)}
                </div>
                <div className="report-item-name">{report.name}</div>
                <div className="report-item-meta">
                  <span>{formatDate(report.started_at)}</span>
                  <span>{formatDuration(report.duration_ms)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="report-detail">
          {selectedReport ? (
            <>
              <div className="detail-header">
                <h2>{selectedReport.name}</h2>
                <div className="detail-badges">
                  {getTypeBadge(selectedReport.run_type)}
                  {getStatusBadge(selectedReport.status)}
                </div>
              </div>

              <div className="detail-section">
                <h3>Timing</h3>
                <table className="detail-table">
                  <tbody>
                    <tr>
                      <td>Started</td>
                      <td>{formatDate(selectedReport.started_at)}</td>
                    </tr>
                    <tr>
                      <td>Completed</td>
                      <td>{formatDate(selectedReport.completed_at)}</td>
                    </tr>
                    <tr>
                      <td>Duration</td>
                      <td>{formatDuration(selectedReport.duration_ms)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {selectedReport.parameters && Object.keys(selectedReport.parameters).length > 0 && (
                <div className="detail-section">
                  <h3>Parameters</h3>
                  <pre className="json-block">
                    {JSON.stringify(selectedReport.parameters, null, 2)}
                  </pre>
                </div>
              )}

              {selectedReport.summary && Object.keys(selectedReport.summary).length > 0 && (
                <div className="detail-section">
                  <h3>Summary</h3>
                  <table className="detail-table">
                    <tbody>
                      {Object.entries(selectedReport.summary).map(([key, value]) => (
                        <tr key={key}>
                          <td>{key.replace(/_/g, ' ')}</td>
                          <td>{typeof value === 'number' ? value.toLocaleString() : String(value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedReport.error && (
                <div className="detail-section error-section">
                  <h3>Error</h3>
                  <pre className="error-block">{selectedReport.error}</pre>
                </div>
              )}

              <div className="detail-section">
                <h3>Logs ({selectedReport.logs?.length || 0} entries)</h3>
                <div className="logs-container">
                  {selectedReport.logs && selectedReport.logs.length > 0 ? (
                    selectedReport.logs.map((log, idx) => (
                      <div key={idx} className={`log-entry ${getLevelClass(log.level)}`}>
                        <span className="log-time">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className={`log-level`}>{log.level.toUpperCase()}</span>
                        <span className="log-message">{log.message}</span>
                      </div>
                    ))
                  ) : (
                    <div className="empty">No logs recorded</div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="no-selection">
              <p>Select a report from the list to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
