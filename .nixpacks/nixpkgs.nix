# Custom nixpkgs configuration for Railway
{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs_20
    python3
  ];
  
  shellHook = ''
    export NODE_ENV=production
    export NPM_CONFIG_CACHE=/tmp/.npm
    export NPM_CONFIG_PREFER_OFFLINE=true
    export NPM_CONFIG_AUDIT=false
    export NPM_CONFIG_FUND=false
  '';
}