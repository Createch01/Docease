fn main() {
  tauri_build::build();

  // Windows, tests seulement : le binaire de `cargo test` n'embarque pas le manifeste que
  // tauri-build ajoute à l'application ; sans Common-Controls v6 il ne démarre pas
  // (STATUS_ENTRYPOINT_NOT_FOUND) dès que les tests utilisent le runtime Tauri simulé
  // (src/access_integration.rs). Opt-in, car pour le build de l'application ce manifeste
  // serait un doublon (CVT1100) :
  //   PowerShell : $env:DOCEASE_TEST_MANIFEST = "1"; cargo test
  println!("cargo:rerun-if-env-changed=DOCEASE_TEST_MANIFEST");
  if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") && std::env::var_os("DOCEASE_TEST_MANIFEST").is_some() {
    let dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{dir}\\test.manifest");
    println!("cargo:rerun-if-changed=test.manifest");
  }
}
