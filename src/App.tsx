import React, { useState } from 'react';
import { Download } from 'lucide-react';
import CloudRepositoryView from './components/CloudRepositoryView';
import LivePostgisConsole from './components/LivePostgisConsole';
import QgisPluginHubView from './components/QgisPluginHubView';
import { downloadMeridianQgisPluginZip } from './utils/qgisPluginBuilder';

type HostTab = 'live_postgis' | 'qgis_plugin' | 'cloud_repo';

export default function App() {
  const [activeTab, setActiveTab] = useState<HostTab>('qgis_plugin');
  const [isDownloadingPlugin, setIsDownloadingPlugin] = useState<boolean>(false);

  const handleDownloadPlugin = async () => {
    setIsDownloadingPlugin(true);
    try {
      const hostUrl =
        typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      await downloadMeridianQgisPluginZip(hostUrl, 'watershed-citarum-2026');
    } finally {
      setIsDownloadingPlugin(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800/80 bg-[#090d16]/95 sticky top-0 z-30 backdrop-blur-sm">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('qgis_plugin');
          }}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          Meridian Sync
        </a>

        {/* Zone 2: 3 concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400">
          <a
            href="#qgis-plugin"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('qgis_plugin');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'qgis_plugin'
                ? 'text-white border-teal-400'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            QGIS Plugin (.ZIP) &amp; Dock
          </a>
          <a
            href="#live-postgis"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('live_postgis');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'live_postgis'
                ? 'text-white border-teal-400'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Live Spatial Tables &amp; SQL Permissions
          </a>
          <a
            href="#cloud-repo"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('cloud_repo');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'cloud_repo'
                ? 'text-white border-teal-400'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Hosted Files (.QGS / .SHP / .TIF)
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleDownloadPlugin}
            disabled={isDownloadingPlugin}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-teal-400 rounded-lg hover:bg-teal-300 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>
              {isDownloadingPlugin
                ? 'Packaging Plugin...'
                : 'Download QGIS Plugin (.zip)'}
            </span>
          </button>
        </div>
      </header>

      {/* Main Workspace Container */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-6 py-8 space-y-8">
        {/* Hero Context & Summary Strip */}
        <section className="border-b border-slate-800/80 pb-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-7 space-y-3">
              <div className="text-xs text-teal-400 font-medium tracking-wide">
                Clean Live File Host · Zero-Auth QGIS Plugin (.ZIP) · Auto-Commit &amp; 1-Click Refresh
              </div>
              <h1
                className="text-2xl sm:text-3xl font-bold tracking-tight text-white"
                style={{ textWrap: 'balance' }}
              >
                Live QGIS file and spatial layer host with a 1-click installable QGIS Plugin.
              </h1>
              <p className="text-sm text-slate-400 leading-relaxed max-w-[68ch]">
                Install <code className="text-slate-200 bg-slate-900 px-1.5 py-0.5 rounded font-mono">meridian_live_host.zip</code> inside QGIS Desktop with zero login or authentication required. Browse and open hosted <code className="text-slate-200 bg-slate-900 px-1.5 py-0.5 rounded font-mono">.qgs</code> projects, <code className="text-slate-200 bg-slate-900 px-1.5 py-0.5 rounded font-mono">.shp</code> layers, <code className="text-slate-200 bg-slate-900 px-1.5 py-0.5 rounded font-mono">.tif</code> rasters, and live PostGIS tables directly from the QGIS Dock—saving in QGIS automatically commits to the host, and clicking <strong className="text-slate-200">Refresh</strong> pulls teammates&apos; live edits immediately.
              </p>
            </div>

            {/* Summary KPI Strip */}
            <div className="lg:col-span-5 grid grid-cols-3 gap-4 bg-slate-900/60 border border-slate-800/90 rounded-xl p-5">
              <div>
                <div className="text-xs text-slate-400">QGIS Connection</div>
                <div className="text-xl font-bold text-teal-400 mt-1 font-mono tabular-nums">
                  Plugin .ZIP
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Zero-Auth Open Host
                </div>
              </div>
              <div className="border-l border-slate-800/80 pl-4">
                <div className="text-xs text-slate-400">Edit Workflow</div>
                <div className="text-xl font-bold text-white mt-1 font-mono tabular-nums">
                  Auto-Save
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  1-Click Refresh
                </div>
              </div>
              <div className="border-l border-slate-800/80 pl-4">
                <div className="text-xs text-slate-400">Access Control</div>
                <div className="text-xl font-bold text-white mt-1 font-mono tabular-nums">
                  SQL RBAC
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Admin · Editor · Viewer
                </div>
              </div>
            </div>
          </div>

          {/* Segmented View Switcher */}
          <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
              <button
                onClick={() => setActiveTab('qgis_plugin')}
                className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'qgis_plugin'
                    ? 'bg-slate-800 text-teal-300 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                01. 1-Click QGIS Plugin (.ZIP) &amp; Dock Simulator
              </button>
              <button
                onClick={() => setActiveTab('live_postgis')}
                className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'live_postgis'
                    ? 'bg-slate-800 text-teal-300 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                02. Live Spatial Tables &amp; SQL Permissions (GRANT / REVOKE)
              </button>
              <button
                onClick={() => setActiveTab('cloud_repo')}
                className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'cloud_repo'
                    ? 'bg-slate-800 text-teal-300 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                03. Hosted Project &amp; Layer Files (.QGS / .SHP / .TIF)
              </button>
            </div>
          </div>
        </section>

        {/* Tab 1: 1-Click QGIS Plugin (.zip) Builder & Dock Simulator */}
        {activeTab === 'qgis_plugin' && <QgisPluginHubView />}

        {/* Tab 2: Live Spatial Tables & SQL Permissions */}
        {activeTab === 'live_postgis' && <LivePostgisConsole />}

        {/* Tab 3: Hosted Project & Layer Files (.qgs / .shp / .tif) */}
        {activeTab === 'cloud_repo' && (
          <CloudRepositoryView
            onSwitchToLivePostgis={() => setActiveTab('live_postgis')}
          />
        )}
      </main>
    </div>
  );
}
