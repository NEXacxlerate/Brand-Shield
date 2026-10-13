"""Seeds the demo brand Acme Bank and runs a scan so all screens have rich data immediately."""
from app.collectors.selection import CollectorRuntime
from app.core.config import get_settings
from app.db.session import make_engine, make_session_factory
from app.models import Brand, OfficialAccount, OfficialApp, Setting, User
from app.services import scan_pipeline
from app.services.scan_pipeline import build_context


def seed():
    settings = get_settings()
    engine = make_engine(settings.database_url)
    session_factory = make_session_factory(engine)

    with session_factory() as db:
        admin = db.query(User).filter(User.role == "admin").first()
        if not admin:
            print("No admin user found")
            return

        # Check if brand already exists
        brand = db.query(Brand).first()
        if not brand:
            brand = Brand(
                name="Acme Bank",
                industry="Finance",
                aliases=["Acme", "AcmeBank"],
                keywords=["acmebank", "acme-bank"],
                domains=["acmebank.com", "acme.com"]
            )
            db.add(brand)
            db.commit()
            db.refresh(brand)

            # Add official accounts
            accounts = [
                ("instagram", "acmebank"),
                ("x", "acmebank"),
                ("facebook", "acmebankofficial"),
                ("linkedin", "acme-bank")
            ]
            for platform, handle in accounts:
                db.add(OfficialAccount(brand_id=brand.id, platform=platform, handle=handle))

            # Add official apps
            apps = [
                ("Acme Bank Mobile", "com.acmebank.mobile", "Acme Bank Ltd", ["google_play", "app_store"])
            ]
            for name, pkg, pub, stores in apps:
                db.add(OfficialApp(brand_id=brand.id, name=name, package_id=pkg, publisher=pub, stores=stores))

            db.commit()
            print("Seeded Acme Bank with official assets")

        # Set data_mode to sample
        mode_setting = db.get(Setting, "data_mode")
        if not mode_setting:
            db.add(Setting(key="data_mode", value="sample"))
        else:
            mode_setting.value = "sample"
        db.commit()

        # Build scan context and run sample scan
        runtime = CollectorRuntime(settings, session_factory)
        ctx = build_context(settings, session_factory, runtime)
        print("Running initial scan...")
        scan, counts = scan_pipeline.run_scan(ctx, brand.id, "all", admin.name, mode="sample")
        print(f"Scan complete: {counts.get('detections_new', 0)} new detections created!")

if __name__ == "__main__":
    seed()
