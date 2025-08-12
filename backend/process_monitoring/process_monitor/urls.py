from django.urls import path
from . import views

urlpatterns = [
    path("api/processes/", views.receive_process_data, name="receive_process_data"),
    path("api/processes/latest/", views.get_latest_processes, name="get_latest_processes"),
]
