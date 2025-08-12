from rest_framework.response import Response
from rest_framework.decorators import api_view
from rest_framework import status
from django.utils import timezone
from django.conf import settings
from django.db.models import Sum, Count
from .models import Machine, Process, ProcessHistory
from .serializers import MachineSerializer
import os


@api_view(["POST"])
def receive_process_data(request):
    if request.headers.get("API-Key") != settings.AGENT_API_KEY:
        return Response({"error": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)

    hostname = request.data.get("hostname")
    processes = request.data.get("processes", [])

    machine, _ = Machine.objects.get_or_create(hostname=hostname)
    machine.last_updated = timezone.now()
    machine.save()

    # Replace current snapshot for quick frontend access
    Process.objects.filter(machine=machine).delete()

    now = timezone.now()
    current_bulk = []
    history_bulk = []
    for proc in processes:
        current_bulk.append(Process(
            machine=machine,
            pid=proc["pid"],
            name=proc["name"],
            cpu_usage=proc["cpu_usage"],
            memory_usage=proc["memory_usage"],
            parent_pid=proc.get("parent_pid")
        ))
        history_bulk.append(ProcessHistory(
            machine=machine,
            pid=proc["pid"],
            name=proc["name"],
            cpu_usage=proc["cpu_usage"],
            memory_usage=proc["memory_usage"],
            parent_pid=proc.get("parent_pid"),
            snapshot_time=now
        ))

    if current_bulk:
        Process.objects.bulk_create(current_bulk)
    if history_bulk:
        ProcessHistory.objects.bulk_create(history_bulk)

    return Response({"status": "success"})


@api_view(["GET"])
def get_latest_processes(request):
    machines = Machine.objects.all()
    serializer = MachineSerializer(machines, many=True)
    return Response(serializer.data)


@api_view(["GET"])
def get_machine_history(request, hostname: str):
    limit = int(request.GET.get("limit", 20))
    qs = (ProcessHistory.objects
          .filter(machine__hostname=hostname)
          .values("snapshot_time")
          .annotate(total_cpu=Sum("cpu_usage"), total_mem=Sum("memory_usage"), processes=Count("id"))
          .order_by("-snapshot_time")[:limit])
    return Response(list(qs))
