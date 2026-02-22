from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Self.ai"
    host: str = "127.0.0.1"
    port: int = 8420
    selfai_home: Path = Path.home() / ".selfai"

    @property
    def data_dir(self) -> Path:
        return self.selfai_home / "data"

    @property
    def imports_dir(self) -> Path:
        return self.data_dir / "imports"

    @property
    def parsed_dir(self) -> Path:
        return self.data_dir / "parsed"

    @property
    def training_dir(self) -> Path:
        return self.data_dir / "training"

    @property
    def models_dir(self) -> Path:
        return self.selfai_home / "models"

    @property
    def base_models_dir(self) -> Path:
        return self.models_dir / "base"

    @property
    def adapters_dir(self) -> Path:
        return self.models_dir / "adapters"

    @property
    def merged_dir(self) -> Path:
        return self.models_dir / "merged"

    @property
    def db_path(self) -> Path:
        return self.selfai_home / "db" / "selfai.db"

    @property
    def logs_dir(self) -> Path:
        return self.selfai_home / "logs"

    def ensure_dirs(self) -> None:
        for d in [
            self.imports_dir, self.parsed_dir, self.training_dir,
            self.base_models_dir, self.adapters_dir, self.merged_dir,
            self.db_path.parent, self.logs_dir,
        ]:
            d.mkdir(parents=True, exist_ok=True)


settings = Settings()
